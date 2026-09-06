import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '../lib/api.js'
import { useActions } from '../lib/actions.js'
import { formatLoad, kgToLb, lbToKg, nextLoadStep, plateForKg } from '../lib/domain/load.js'
import { exerciseExecutionStatus, prescribedResult, previousSetForDraft, previousTemplateSession } from '../lib/domain/session.js'
import { rirLabelKey } from '../lib/domain/rir.js'
import { useEquipment, useExercises, useMedia, useSessions, useSetLogs, useSettings } from '../lib/repo.js'
import type { CatalogExercise, PlanSnapshotItem, SetLog, TemplateItem } from '../lib/types.js'
import { MediaImage } from './MediaImage.js'
import { PainCapture } from './PainCapture.js'
import { RirSelector } from './RirSelector.js'
import { Modal, NumberStepper } from './ui.js'

export type SessionChecklistItem = TemplateItem | PlanSnapshotItem

/** Session overview split into pending and resolved exercises. */
export function SessionExerciseChecklist({ sessionId, items, logs, onSelect }: {
  sessionId: string
  items: SessionChecklistItem[]
  logs: SetLog[]
  onSelect: (itemId: string) => void
}) {
  const { t } = useTranslation()
  const exercises = useExercises()
  const equipment = useEquipment()
  const allLogs = useSetLogs()
  const sessions = useSessions()
  const settings = useSettings()
  const session = sessions.find((entry) => entry.id === sessionId) ?? null
  const previous = useMemo(() => session ? previousTemplateSession(session, sessions) : null, [session, sessions])
  const currentByItem = new Map(items.map((item) => [item.id, logs.filter((log) => log.templateItemId === item.id && !log.isWarmup)]))
  const statusOf = (item: SessionChecklistItem) => exerciseExecutionStatus(item, currentByItem.get(item.id) ?? [])
  const sections = [
    { key: 'pending', items: items.filter((item) => statusOf(item) === 'pending') },
    { key: 'skipped', items: items.filter((item) => statusOf(item) === 'skipped') },
    { key: 'done', items: items.filter((item) => statusOf(item) === 'done') },
  ] as const

  return <section className="session-checklist" aria-label={t('session.exercise_list')}>
    {sections.map((section) => section.items.length > 0 && <div className="session-checklist__group" key={section.key}>
      <header className="session-checklist__head"><h2>{t(`session.${section.key}_exercises`)}</h2><span className="badge">{section.items.length}</span></header>
      <ol className="session-checklist__list">{section.items.map((item) => {
        const index = items.indexOf(item)
        const exercise = exercises.find((entry) => entry.id === item.exerciseId)
        const current = currentByItem.get(item.id) ?? []
        const previousLogs = allLogs.filter((log) => (
          log.sessionId === previous?.id && log.exerciseId === item.exerciseId && !log.isWarmup && !log.skipped
        )).sort((a, b) => a.setIndex - b.setIndex)
        const representative = current.find((log) => !log.skipped) ?? previousLogs.at(-1) ?? null
        const snapshot = 'exerciseName' in item ? item : null
        const gear = snapshot?.equipment ?? equipment.find((entry) => entry.id === exercise?.equipmentId) ?? null
        const perSide = snapshot?.loadPerSide ?? exercise?.loadPerSide ?? false
        const range = item.repMin === item.repMax || item.repMax === null ? `${item.repMin ?? '—'}` : `${item.repMin ?? 0}–${item.repMax}`
        const effort = representative?.rir ?? item.rirTarget
        const status = statusOf(item)
        return <li className={`session-exercise session-exercise--${status}`} key={item.id}>
          <button type="button" className="session-exercise__overview" onClick={() => onSelect(item.id)}>
            <span className="session-exercise__number mono">{String(index + 1).padStart(2, '0')}</span>
            <span className="session-exercise__copy">
              <strong>{snapshot?.exerciseName ?? exercise?.name ?? t('library.gone')}</strong>
              <small>{item.sets} × {range} · {effort === null ? '—' : t(rirLabelKey(effort)!)}</small>
              <small>{t('session.expected_load')}: {formatLoad(representative?.weightKg ?? null, representative?.plateCount ?? null, settings?.unit ?? 'kg', settings?.showPlates ?? true, perSide ? t('session.per_side_short') : null)}{gear?.name ? ` · ${gear.name}` : ''}</small>
            </span>
            <span className="session-exercise__state">{status === 'done' ? '✓' : status === 'skipped' ? t('session.skipped') : t('session.open_exercise')}</span>
          </button>
        </li>
      })}</ol>
    </div>)}
  </section>
}

interface Draft { kg: number | null; plate: number | null; result: number | null; rir: number | null }

/** One-exercise editor that keeps every planned set visible at once. */
export function SessionExerciseFlow({ sessionId, item, index, logs, resting, restRemaining, onRest, onContinue, onDone }: {
  sessionId: string
  item: SessionChecklistItem
  index: number
  logs: SetLog[]
  resting: boolean
  restRemaining: number
  onRest: () => void
  onContinue: () => void
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const exercises = useExercises()
  const equipment = useEquipment()
  const allLogs = useSetLogs()
  const sessions = useSessions()
  const settings = useSettings()
  const media = useMedia().find((entry) => entry.exerciseId === item.exerciseId) ?? null
  const { logSet, removeSet, logPain } = useActions()
  const exercise = exercises.find((entry) => entry.id === item.exerciseId) ?? null
  const snapshot = 'exerciseName' in item ? item : null
  const gear = snapshot?.equipment ?? equipment.find((entry) => entry.id === exercise?.equipmentId) ?? null
  const loadPerSide = snapshot?.loadPerSide ?? exercise?.loadPerSide ?? false
  const name = snapshot?.exerciseName ?? exercise?.name ?? t('library.gone')
  const workLogs = logs.filter((log) => !log.isWarmup && !log.skipped).sort((a, b) => a.setIndex - b.setIndex)
  const currentSession = sessions.find((entry) => entry.id === sessionId) ?? null
  const previous = useMemo(() => currentSession ? previousTemplateSession(currentSession, sessions) : null, [currentSession, sessions])
  const previousLogs = allLogs.filter((log) => log.sessionId === previous?.id && log.exerciseId === item.exerciseId && !log.isWarmup && !log.skipped).sort((a, b) => a.setIndex - b.setIndex)
  const sourceKey = [...workLogs, ...previousLogs].map((log) => `${log.id}:${log.updatedAt}`).join('|')
  const initialDrafts = (): Draft[] => Array.from({ length: item.sets }, (_, setIndex) => {
    const current = workLogs.find((log) => log.setIndex === setIndex)
    const source = current ?? previousSetForDraft([], previousLogs, setIndex, item.trackingMode ?? 'compact')
    return {
      kg: source?.weightKg ?? null,
      plate: source?.plateCount ?? null,
      result: (item.isTimeBased ? source?.seconds : source?.reps) ?? prescribedResult(item.repMin, item.repMax),
      rir: source?.rir ?? item.rirTarget,
    }
  })
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts)
  const [showImage, setShowImage] = useState(false)
  const [showPain, setShowPain] = useState(false)
  const [catalog, setCatalog] = useState<CatalogExercise | null>(null)

  // O histórico chega do IndexedDB depois do primeiro render. A chave atualiza
  // os rascunhos quando ele chega, sem depender da identidade do array Dexie.
  useEffect(() => setDrafts(initialDrafts()), [item.id, item.sets, sourceKey])
  useEffect(() => {
    if (!exercise?.catalogExerciseId) return
    let current = true
    void apiFetch<CatalogExercise>(`/api/catalog/exercises/${exercise.catalogExerciseId}`)
      .then((result) => { if (current) setCatalog(result) }).catch(() => { if (current) setCatalog(null) })
    return () => { current = false }
  }, [exercise?.catalogExerciseId])

  const lang = i18n.language.startsWith('pt') ? 'pt' : 'en'
  const videoUrl = catalog?.video?.[lang] ?? catalog?.video?.pt ?? catalog?.video?.en ?? null
  const description = catalog?.description?.[lang] ?? catalog?.description?.pt ?? catalog?.description?.en ?? null
  const completed = workLogs.length >= item.sets

  async function completeExercise() {
    for (const log of logs.filter((entry) => !entry.isWarmup)) await removeSet(log.id)
    for (const [setIndex, draft] of drafts.entries()) {
      await logSet({ sessionId, templateItemId: item.id, exerciseId: item.exerciseId, setIndex,
        weightKg: draft.kg, plateCount: draft.plate, reps: item.isTimeBased ? null : draft.result,
        seconds: item.isTimeBased ? draft.result : null, rir: draft.rir })
    }
    onDone()
  }

  async function skipExercise() {
    for (const log of logs.filter((entry) => !entry.isWarmup)) await removeSet(log.id)
    for (let skippedIndex = 0; skippedIndex < item.sets; skippedIndex++) {
      await logSet({ sessionId, templateItemId: item.id, exerciseId: item.exerciseId, setIndex: skippedIndex, skipped: true, completedAt: null })
    }
    onDone()
  }

  async function addWarmup() {
    const draft = drafts[0]!
    const warmupIndex = logs.filter((log) => log.isWarmup).length
    await logSet({ sessionId, templateItemId: item.id, exerciseId: item.exerciseId, setIndex: warmupIndex,
      isWarmup: true, weightKg: draft.kg, plateCount: draft.plate,
      reps: item.isTimeBased ? null : draft.result, seconds: item.isTimeBased ? draft.result : null, rir: draft.rir })
  }

  async function reopenExercise() {
    for (const log of logs.filter((entry) => !entry.isWarmup)) await removeSet(log.id)
  }

  function updateDraft(setIndex: number, patch: Partial<Draft>) {
    setDrafts((current) => current.map((draft, index) => index === setIndex ? { ...draft, ...patch } : draft))
  }

  function stepLoad(setIndex: number, direction: 1 | -1) {
    const current = drafts[setIndex]!
    updateDraft(setIndex, nextLoadStep(gear ?? { loadType: 'livre', plateTable: [], incrementKg: null }, { kg: current.kg, plate: current.plate }, direction))
  }

  function typeLoad(setIndex: number, displayValue: number | null) {
    const normalized = displayValue === null ? null : Math.min(settings?.unit === 'lb' ? 2202 : 999, Math.max(0, displayValue))
    const kg = normalized === null ? null : settings?.unit === 'lb' ? lbToKg(normalized) : normalized
    const plate = kg !== null && gear?.loadType === 'pino' ? plateForKg(gear, kg) : null
    setDrafts((current) => current.map((draft, index) => {
      if (index === setIndex) return { ...draft, kg, plate }
      // A primeira carga informada vira o padrão das séries seguintes ainda
      // vazias, mas nunca apaga a progressão que veio do treino anterior.
      if (index > setIndex && draft.kg === null) return { ...draft, kg, plate }
      return draft
    }))
  }

  if (resting) return <section className="session-focus session-rest">
    <span className="eyebrow">{t('session.optional_rest')}</span>
    <strong className="clock">{Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, '0')}</strong>
    <p className="muted">{name}</p>
    <button type="button" className="button button--primary" onClick={onContinue}>{t('session.stop_rest')}</button>
  </section>

  if (completed) return <section className="session-focus">
    <span className="session-focus__done">✓</span><h2>{name}</h2><p className="muted">{t('session.exercise_completed')}</p>
    <div className="row">
      <button type="button" className="button button--primary" onClick={onDone}>{t('session.back_to_exercises')}</button>
      <button type="button" className="button button--ghost" onClick={() => void reopenExercise()}>{t('session.redo_exercise')}</button>
    </div>
  </section>

  const resultMin = item.repMin ?? 0
  const resultMax = item.repMax ?? Number.POSITIVE_INFINITY
  return <section className="session-focus">
    <header className="session-focus__head">
      <button type="button" className="button button--ghost" onClick={() => void skipExercise()}>{t('session.back_and_skip')}</button>
      <span className="mono muted">{String(index + 1).padStart(2, '0')} · {t('session.sets_count', { count: item.sets })}</span>
    </header>
    <div><h2>{name}</h2><p className="mono muted">{t('session.rest_seconds', { count: item.restSeconds ?? 90 })}</p></div>
    <ol className="session-focus__sets">
      {drafts.map((draft, setIndex) => <li key={setIndex} className="session-focus__set">
        <span className="eyebrow">{t('session.set', { n: setIndex + 1 })}</span>
        <div className="session-focus__fields">
          <NumberStepper
            label={loadPerSide ? `${t('session.load')} · ${t('session.per_side_short')}` : t('session.load')}
            value={draft.kg === null ? null : settings?.unit === 'lb' ? Number(kgToLb(draft.kg).toFixed(1)) : draft.kg}
            suffix={loadPerSide ? `${settings?.unit ?? 'kg'}/${t('session.per_side_short')}` : settings?.unit ?? 'kg'}
            step={0.5}
            max={settings?.unit === 'lb' ? 2202 : 999}
            onChange={(value) => typeLoad(setIndex, value)}
            onStep={(direction) => stepLoad(setIndex, direction)}
          />
          <NumberStepper
            label={item.isTimeBased ? t('session.seconds') : t('session.reps')}
            value={draft.result}
            min={resultMin}
            max={Number.isFinite(resultMax) ? resultMax : undefined}
            step={item.isTimeBased ? 5 : 1}
            onChange={(result) => updateDraft(setIndex, { result: result === null ? null : Math.min(resultMax, Math.max(resultMin, result)) })}
            onStep={(direction) => updateDraft(setIndex, { result: Math.min(resultMax, Math.max(resultMin, (draft.result ?? resultMin) + direction * (item.isTimeBased ? 5 : 1))) })}
          />
          <RirSelector value={draft.rir} onChange={(rir) => updateDraft(setIndex, { rir })} />
        </div>
      </li>)}
    </ol>
    {(item.notes || (exercise?.cues.length ?? 0) > 0 || description) && <details className="session-focus__specifics">
      <summary>{t('session.execution_details')}</summary>{item.notes && <p>{item.notes}</p>}
      {exercise?.cues.map((cue, cueIndex) => <p key={cueIndex}>• {cue}</p>)}{description && <p>{description}</p>}
    </details>}
    {(media || videoUrl) && <div className="session__resources">
      {media && <button type="button" className="button button--quiet" onClick={() => setShowImage(true)}>{t('session.view_image')}</button>}
      {videoUrl && <a className="button button--quiet" href={videoUrl} target="_blank" rel="noopener noreferrer">{t('session.watch_video')}</a>}
    </div>}
    {showPain ? <PainCapture onCancel={() => setShowPain(false)} onSave={async (regionSlug, level) => {
      await logPain({ regionSlug, level, sessionId, setLogId: workLogs.at(-1)?.id ?? null }); setShowPain(false)
    }} /> : <div className="session-focus__actions">
      <button type="button" className="button button--primary" onClick={() => void completeExercise()}>{t('session.complete_exercise')}</button>
      <button type="button" className="button button--quiet" onClick={onRest}>{t('session.start_rest')}</button>
      <button type="button" className="button button--quiet" onClick={() => void addWarmup()}>{t('session.add_warmup')}</button>
      <button type="button" className="button button--quiet" onClick={() => setShowPain(true)}>{t('session.pain')}</button>
      <button type="button" className="button button--ghost" onClick={() => void skipExercise()}>{t('session.skip_exercise')}</button>
    </div>}
    {showImage && media && <Modal title={name} closeLabel={t('common.close')} onClose={() => setShowImage(false)} wide>
      <MediaImage className="media-lightbox__image" mediaId={media.id} variant="full" alt={name} />
    </Modal>}
  </section>
}
