import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useActions } from '../lib/actions.js'
import { apiFetch } from '../lib/api.js'
import { prescribedResult, previousTemplateSession } from '../lib/domain/session.js'
import { formatLoad, nextLoadStep } from '../lib/domain/load.js'
import { useEquipment, useExercises, useMedia, useSessions, useSetLogs, useSettings } from '../lib/repo.js'
import type { CatalogExercise, PlanSnapshotItem, SetLog, TemplateItem } from '../lib/types.js'
import { MediaImage } from './MediaImage.js'
import { PainCapture } from './PainCapture.js'
import { Modal, Stepper } from './ui.js'
import { RirSelector } from './RirSelector.js'
import { rirLabelKey } from '../lib/domain/rir.js'

type ChecklistItem = TemplateItem | PlanSnapshotItem

interface SetDraft {
  kg: number | null
  plate: number | null
  result: number | null
  rir: number | null
}

/** Checklist completo da musculação; séries e repetições vêm somente da prescrição. */
export function SessionExerciseChecklist({ sessionId, items, logs }: {
  sessionId: string
  items: ChecklistItem[]
  logs: SetLog[]
}) {
  const { t } = useTranslation()

  return (
    <section className="session-checklist" aria-label={t('session.exercise_list')}>
      <header className="session-checklist__head">
        <h2>{t('session.exercise_list')}</h2>
        <p className="muted">{t('session.edit_reps_hint')}</p>
      </header>
      <ol className="session-checklist__list">
        {items.map((item, index) => (
          <ExerciseRow
            key={item.id}
            index={index}
            item={item}
            sessionId={sessionId}
            logs={logs.filter((log) => log.templateItemId === item.id)}
          />
        ))}
      </ol>
    </section>
  )
}

function ExerciseRow({ item, index, sessionId, logs }: {
  item: ChecklistItem
  index: number
  sessionId: string
  logs: SetLog[]
}) {
  const { t, i18n } = useTranslation()
  const exercises = useExercises()
  const equipment = useEquipment()
  const allLogs = useSetLogs()
  const sessions = useSessions()
  const media = useMedia().find((entry) => entry.exerciseId === item.exerciseId) ?? null
  const settings = useSettings()
  const { logSet, removeSet, logPain } = useActions()
  const exercise = exercises.find((entry) => entry.id === item.exerciseId) ?? null
  const snapshot = 'exerciseName' in item ? item : null
  const gear = snapshot?.equipment ?? equipment.find((entry) => entry.id === exercise?.equipmentId) ?? null
  const loadPerSide = snapshot?.loadPerSide ?? exercise?.loadPerSide ?? false
  const name = snapshot?.exerciseName ?? exercise?.name ?? t('library.gone')
  const workLogs = logs.filter((log) => !log.isWarmup)
  const skipped = workLogs.length >= item.sets && workLogs.every((log) => log.skipped)
  const completed = workLogs.length >= item.sets && workLogs.some((log) => !log.skipped)
  const currentSession = sessions.find((entry) => entry.id === sessionId) ?? null
  const previousSession = useMemo(() => currentSession
    ? previousTemplateSession(currentSession, sessions)
    : null,
  [currentSession, sessions])
  const previousLogs = useMemo(() => allLogs
    .filter((log) => (
      log.sessionId === previousSession?.id && log.exerciseId === item.exerciseId
      && !log.isWarmup && !log.skipped
    ))
    .sort((a, b) => a.setIndex - b.setIndex),
  [allLogs, item.exerciseId, previousSession?.id])
  const recorded = workLogs.find((log) => !log.skipped)
  const draftsFrom = (source: SetLog[]): SetDraft[] => Array.from({ length: item.sets }, (_, setIndex) => {
    const prior = (item.trackingMode ?? 'compact') === 'compact'
      ? source.at(-1)
      : source.find((log) => log.setIndex === setIndex) ?? source.at(-1)
    return {
      kg: prior?.weightKg ?? null,
      plate: prior?.plateCount ?? null,
      result: item.isTimeBased ? prior?.seconds ?? prescribedResult(item.repMin, item.repMax) : prior?.reps ?? prescribedResult(item.repMin, item.repMax),
      rir: prior?.rir ?? item.rirTarget,
    }
  })
  const [drafts, setDrafts] = useState<SetDraft[]>(() => draftsFrom(workLogs.length > 0 ? workLogs : previousLogs))
  const [showImage, setShowImage] = useState(false)
  const [showPain, setShowPain] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [catalog, setCatalog] = useState<CatalogExercise | null>(null)

  const sourceKey = (workLogs.length > 0 ? workLogs : previousLogs)
    .map((log) => `${log.id}:${log.updatedAt}`)
    .join(':')
  useEffect(() => {
    setDrafts(draftsFrom(workLogs.length > 0 ? workLogs : previousLogs))
  }, [sourceKey, item.id, item.sets])

  useEffect(() => {
    if (!exercise?.catalogExerciseId) return
    let current = true
    void apiFetch<CatalogExercise>(`/api/catalog/exercises/${exercise.catalogExerciseId}`)
      .then((result) => { if (current) setCatalog(result) })
      .catch(() => { if (current) setCatalog(null) })
    return () => { current = false }
  }, [exercise?.catalogExerciseId])

  async function clearWorkLogs() {
    for (const log of workLogs) await removeSet(log.id)
  }

  async function complete() {
    await clearWorkLogs()
    for (let setIndex = 0; setIndex < item.sets; setIndex++) {
      const draft = item.trackingMode === 'full' ? drafts[setIndex]! : drafts[0]!
      await logSet({
        sessionId,
        templateItemId: item.id,
        exerciseId: item.exerciseId,
        setIndex,
        weightKg: draft.kg,
        plateCount: draft.plate,
        reps: item.isTimeBased ? null : draft.result,
        seconds: item.isTimeBased ? draft.result : null,
        rir: draft.rir,
      })
    }
  }

  async function skip() {
    await clearWorkLogs()
    for (let setIndex = 0; setIndex < item.sets; setIndex++) {
      await logSet({
        sessionId, templateItemId: item.id, exerciseId: item.exerciseId,
        setIndex, skipped: true, completedAt: null,
      })
    }
  }

  async function addWarmup() {
    const warmups = logs.filter((log) => log.isWarmup)
    const draft = drafts[0]!
    await logSet({
      sessionId,
      templateItemId: item.id,
      exerciseId: item.exerciseId,
      setIndex: warmups.length,
      isWarmup: true,
      weightKg: draft.kg,
      plateCount: draft.plate,
      reps: item.isTimeBased ? null : draft.result,
      seconds: item.isTimeBased ? draft.result : null,
      rir: draft.rir,
    })
  }

  const range = item.repMin === item.repMax || item.repMax === null
    ? `${item.repMin ?? '—'}`
    : `${item.repMin ?? 0}–${item.repMax}`
  const unit = settings?.unit ?? 'kg'
  const showPlates = settings?.showPlates ?? true
  const trackingMode = item.trackingMode ?? 'compact'
  const lang = i18n.language.startsWith('pt') ? 'pt' : 'en'
  const videoUrl = catalog?.video?.[lang] ?? catalog?.video?.pt ?? catalog?.video?.en ?? null
  const description = catalog?.description?.[lang] ?? catalog?.description?.pt ?? catalog?.description?.en ?? null

  function updateDraft(setIndex: number, patch: Partial<SetDraft>) {
    setDrafts((current) => current.map((draft, index) => index === setIndex ? { ...draft, ...patch } : draft))
  }

  function stepLoad(setIndex: number, direction: 1 | -1) {
    const draft = drafts[setIndex]!
    updateDraft(setIndex, nextLoadStep(
      gear ?? { loadType: 'livre', plateTable: [], incrementKg: null },
      { kg: draft.kg, plate: draft.plate }, direction,
    ))
  }

  function fieldsFor(setIndex: number) {
    const draft = drafts[setIndex]!
    const resultMin = item.repMin ?? 0
    const resultMax = item.repMax ?? Number.POSITIVE_INFINITY
    return (
      <div className="session-set-fields">
        <Stepper
          label={loadPerSide ? `${t('session.load')} · ${t('session.per_side_short')}` : t('session.load')}
          value={formatLoad(draft.kg, draft.plate, unit, showPlates, loadPerSide ? t('session.per_side_short') : null)}
          disabled={completed}
          onStep={(direction) => stepLoad(setIndex, direction)}
        />
        <Stepper
          label={item.isTimeBased ? t('session.seconds') : t('session.reps')}
          value={draft.result ?? '—'}
          disabled={completed}
          onStep={(direction) => updateDraft(setIndex, {
            result: Math.min(resultMax, Math.max(resultMin, (draft.result ?? resultMin) + direction)),
          })}
        />
        <RirSelector
          label={t('rir.label')}
          value={draft.rir}
          disabled={completed}
          onChange={(rir) => updateDraft(setIndex, { rir })}
        />
      </div>
    )
  }

  return (
    <li className={`session-exercise${completed ? ' session-exercise--done' : ''}${skipped ? ' session-exercise--skipped' : ''}`}>
      <div className="session-exercise__summary">
        <button
          type="button"
          role="checkbox"
          aria-checked={completed}
          aria-label={completed ? t('session.reopen_exercise', { name }) : t('session.complete_exercise', { name })}
          className="session-exercise__check"
          onClick={() => void (completed ? clearWorkLogs() : complete())}
        >
          {completed ? '✓' : ''}
        </button>
        <button type="button" className="session-exercise__title" onClick={() => setExpanded(!expanded)}>
          <span className="mono muted">{String(index + 1).padStart(2, '0')}</span>
          <span>
            <strong>{name}</strong>
            <small>{t('session.target', {
              sets: item.sets,
              range: item.isTimeBased ? `${range}s` : range,
              effort: rirLabelKey(item.rirTarget) ? t(rirLabelKey(item.rirTarget)!) : '—',
            })}{item.restSeconds ? ` · ${t('session.rest_seconds', { count: item.restSeconds })}` : ''}</small>
          </span>
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
      </div>

      {(item.notes || (exercise?.cues.length ?? 0) > 0) && (
        <div className="session-exercise__specifics">
          {item.notes && <p>{item.notes}</p>}
          {exercise?.cues.map((cue, cueIndex) => <span key={cueIndex}>• {cue}</span>)}
        </div>
      )}

      <div className="session-exercise__tracking">
        {trackingMode === 'compact' ? fieldsFor(0) : (
          <ol className="session-set-drafts">
            {drafts.map((_, setIndex) => (
              <li key={setIndex}>
                <span className="eyebrow">{t('session.set', { n: setIndex + 1 })}</span>
                {fieldsFor(setIndex)}
              </li>
            ))}
          </ol>
        )}
        {skipped && <span className="badge">{t('session.skipped')}</span>}
      </div>

      {expanded && (
        <div className="session-exercise__details">
          {description && <p className="session-exercise__description">{description}</p>}
          {(media || videoUrl) && <div className="session__resources">
            {media && <button type="button" className="button button--quiet" onClick={() => setShowImage(true)}>{t('session.view_image')}</button>}
            {videoUrl && <a className="button button--quiet" href={videoUrl} target="_blank" rel="noopener noreferrer">{t('session.watch_video')}</a>}
          </div>}
          {showPain ? (
            <PainCapture
              onCancel={() => setShowPain(false)}
              onSave={async (regionSlug, level) => {
                await logPain({ regionSlug, level, sessionId, setLogId: recorded?.id ?? null })
                setShowPain(false)
              }}
            />
          ) : (
            <div className="row">
              <button type="button" className="button button--quiet" onClick={() => void addWarmup()}>{t('session.add_warmup')}</button>
              <button type="button" className="button button--ghost" onClick={() => setShowPain(true)}>{t('session.pain')}</button>
              <button type="button" className="button button--ghost" disabled={completed || skipped} onClick={() => void skip()}>{t('session.skip_exercise')}</button>
            </div>
          )}
        </div>
      )}

      {showImage && media && <Modal title={name} closeLabel={t('common.close')} onClose={() => setShowImage(false)} wide>
        <MediaImage className="media-lightbox__image" mediaId={media.id} variant="full" alt={name} />
      </Modal>}
    </li>
  )
}
