import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useActions } from '../lib/actions.js'
import { apiFetch } from '../lib/api.js'
import { prescribedResult } from '../lib/domain/session.js'
import { formatLoad, nextLoadStep } from '../lib/domain/load.js'
import { useEquipment, useExercises, useMedia, useSetLogs, useSettings } from '../lib/repo.js'
import type { CatalogExercise, PlanSnapshotItem, SetLog, TemplateItem } from '../lib/types.js'
import { MediaImage } from './MediaImage.js'
import { PainCapture } from './PainCapture.js'
import { Modal, Stepper } from './ui.js'

type ChecklistItem = TemplateItem | PlanSnapshotItem

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
  const previous = useMemo(() => allLogs
    .filter((log) => (
      log.sessionId !== sessionId && log.exerciseId === item.exerciseId
      && !log.isWarmup && !log.skipped && log.weightKg !== null
    ))
    .sort((a, b) => (b.completedAt ?? b.createdAt ?? '').localeCompare(a.completedAt ?? a.createdAt ?? ''))[0],
  [allLogs, item.exerciseId, sessionId])
  const recorded = workLogs.find((log) => !log.skipped)
  const [load, setLoad] = useState({ kg: recorded?.weightKg ?? previous?.weightKg ?? null, plate: recorded?.plateCount ?? previous?.plateCount ?? null })
  const [showImage, setShowImage] = useState(false)
  const [showPain, setShowPain] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)

  useEffect(() => {
    if (recorded) {
      setLoad({ kg: recorded.weightKg, plate: recorded.plateCount })
      return
    }
    setLoad((current) => current.kg !== null || current.plate !== null
      ? current
      : { kg: previous?.weightKg ?? null, plate: previous?.plateCount ?? null })
  }, [recorded?.id, previous?.id])

  useEffect(() => {
    if (!expanded || !exercise?.catalogExerciseId || videoUrl) return
    let current = true
    void apiFetch<CatalogExercise>(`/api/catalog/exercises/${exercise.catalogExerciseId}`)
      .then((catalog) => {
        if (!current) return
        const lang = i18n.language.startsWith('pt') ? 'pt' : 'en'
        setVideoUrl(catalog.video?.[lang] ?? catalog.video?.pt ?? catalog.video?.en ?? null)
      })
      .catch(() => { if (current) setVideoUrl(null) })
    return () => { current = false }
  }, [expanded, exercise?.catalogExerciseId, i18n.language, videoUrl])

  async function clearWorkLogs() {
    for (const log of workLogs) await removeSet(log.id)
  }

  async function complete() {
    await clearWorkLogs()
    const result = prescribedResult(item.repMin, item.repMax)
    for (let setIndex = 0; setIndex < item.sets; setIndex++) {
      await logSet({
        sessionId,
        templateItemId: item.id,
        exerciseId: item.exerciseId,
        setIndex,
        weightKg: load.kg,
        plateCount: load.plate,
        reps: item.isTimeBased ? null : result,
        seconds: item.isTimeBased ? result : null,
        rir: item.rirTarget,
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
    const result = prescribedResult(item.repMin, item.repMax)
    await logSet({
      sessionId,
      templateItemId: item.id,
      exerciseId: item.exerciseId,
      setIndex: warmups.length,
      isWarmup: true,
      weightKg: load.kg,
      plateCount: load.plate,
      reps: item.isTimeBased ? null : result,
      seconds: item.isTimeBased ? result : null,
      rir: item.rirTarget,
    })
  }

  const range = item.repMin === item.repMax || item.repMax === null
    ? `${item.repMin ?? '—'}`
    : `${item.repMin ?? 0}–${item.repMax}`
  const unit = settings?.unit ?? 'kg'
  const showPlates = settings?.showPlates ?? true

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
              rir: item.rirTarget ?? '—',
            })}{item.restSeconds ? ` · ${t('session.rest_seconds', { count: item.restSeconds })}` : ''}</small>
          </span>
          <span aria-hidden="true">{expanded ? '−' : '+'}</span>
        </button>
      </div>

      <div className="session-exercise__load">
        <Stepper
          label={loadPerSide ? `${t('session.load')} · ${t('session.per_side_short')}` : t('session.load')}
          value={formatLoad(load.kg, load.plate, unit, showPlates, loadPerSide ? t('session.per_side_short') : null)}
          disabled={completed}
          onStep={(direction) => setLoad(nextLoadStep(
            gear ?? { loadType: 'livre', plateTable: [], incrementKg: null }, load, direction,
          ))}
        />
        {skipped && <span className="badge">{t('session.skipped')}</span>}
      </div>

      {expanded && (
        <div className="session-exercise__details">
          {(media || videoUrl) && <div className="session__resources">
            {media && <button type="button" className="button button--quiet" onClick={() => setShowImage(true)}>{t('session.view_image')}</button>}
            {videoUrl && <a className="button button--quiet" href={videoUrl} target="_blank" rel="noopener noreferrer">{t('session.watch_video')}</a>}
          </div>}
          {(exercise?.cues.length ?? 0) > 0 && <ul className="cues">{exercise?.cues.map((cue, cueIndex) => <li key={cueIndex}>{cue}</li>)}</ul>}
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
