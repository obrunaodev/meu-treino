import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useCardioLogs, useCardioOptions, useExercises, useSessions, useSetLogs, useSettings,
  useTemplateItems, useTemplates,
} from '../lib/repo.js'
import { useActions } from '../lib/actions.js'
import {
  CARDIO_SECONDS, PREP_SECONDS, elapsedSeconds, exerciseProgress, finalStatus, formatClock,
  nextSlot, remainingSeconds,
} from '../lib/domain/session.js'
import { formatLoad } from '../lib/domain/load.js'
import { sideLabel } from '../lib/labels.js'
import { clearSessionPhase, useSessionPhase } from '../lib/session-phase.js'
import { Card, Empty, Select } from '../components/ui.js'
import { SessionExerciseChecklist } from '../components/SessionExerciseChecklist.js'
import type { SetLog, TemplateItem } from '../lib/types.js'

export function Session() {
  const { sessionId } = useParams()
  const { t } = useTranslation()
  const navigate = useNavigate()

  const sessions = useSessions()
  const session = sessions.find((s) => s.id === sessionId) ?? null
  const currentItems = useTemplateItems(session?.templateId)
  const items = session?.planSnapshot?.items ?? currentItems
  const templates = useTemplates(session?.programId)
  const template = templates.find((entry) => entry.id === session?.templateId) ?? null
  const cardioOptions = useCardioOptions()
  const plannedCardio = cardioOptions.find((option) => option.id === template?.cardioOptionId) ?? null
  const logs = useSetLogs(session?.id)
  const cardio = useCardioLogs(session?.id)
  const exercises = useExercises()
  const settings = useSettings()
  const { updateSession, logCardio } = useActions()

  const [{ phase, phaseStartedAt }, setPhase] = useSessionPhase(
    sessionId,
    logs.some((l) => !l.isWarmup),
  )
  const [now, setNow] = useState(Date.now())
  const [intensity, setIntensity] = useState<'leve' | 'moderado' | 'forte' | null>(null)
  const [cardioOptionId, setCardioOptionId] = useState('')

  useEffect(() => {
    if (cardio.length > 0) return
    setCardioOptionId(plannedCardio?.id ?? '')
    setIntensity(template?.cardioIntensity ?? null)
  }, [plannedCardio?.id, template?.cardioIntensity, cardio.length])

  // Um tick por segundo só para re-renderizar; o tempo real vem sempre do
  // instante absoluto, então perder ticks em segundo plano não corrompe nada.
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(handle)
  }, [])

  const slot = useMemo(() => nextSlot(
    items.map((i) => ({ id: i.id, sets: i.sets, restSeconds: i.restSeconds })),
    logs.map((l) => ({
      templateItemId: l.templateItemId, setIndex: l.setIndex, isWarmup: l.isWarmup, skipped: l.skipped,
    })),
  ), [items, logs])

  // Entrou no cardio: o relógio recomeça daqui, senão herdaria o descanso anterior.
  //
  // `items.length > 0` não é redundante: o Dexie devolve lista vazia enquanto a
  // consulta não resolve, e sem essa guarda a sessão pularia para o cardio no
  // primeiro render, antes de os exercícios chegarem. Template de verdade sem
  // exercícios cai no estado vazio logo abaixo e nunca chega aqui.
  useEffect(() => {
    if (items.length > 0 && !slot && phase !== 'cardio') setPhase('cardio')
  }, [items.length, slot, phase])

  // A interface antiga parava entre séries. Sessões abertas nessa versão
  // retomam direto no checklist, que registra o exercício inteiro.
  useEffect(() => {
    if (phase === 'descanso') setPhase('exercicios')
  }, [phase])

  const progress = exerciseProgress(
    items.map((i) => ({ id: i.id, sets: i.sets, restSeconds: i.restSeconds })),
    logs.map((l) => ({
      templateItemId: l.templateItemId, setIndex: l.setIndex, isWarmup: l.isWarmup, skipped: l.skipped,
    })),
  )

  if (!session) return <Empty message={t('session.no_open')} />
  if (items.length === 0) {
    return (
      <Empty
        message={t('session.empty_template')}
        action={<Link className="button button--primary" to="/treinos">{t('session.edit_template')}</Link>}
      />
    )
  }

  async function finish() {
    if (cardio.length === 0 && intensity) {
      await logCardio({
        sessionId: session!.id,
        cardioOptionId: cardioOptionId || null,
        modality: cardioOptions.find((option) => option.id === cardioOptionId)?.name ?? null,
        durationSeconds: elapsedSeconds(phaseStartedAt, now),
        perceivedIntensity: intensity,
      })
    }
    await updateSession(session!.id, {
      status: finalStatus(
        items.map((i) => ({ id: i.id, sets: i.sets, restSeconds: i.restSeconds })),
        logs.map((l) => ({
          templateItemId: l.templateItemId, setIndex: l.setIndex, isWarmup: l.isWarmup, skipped: l.skipped,
        })),
      ),
      endedAt: new Date().toISOString(),
    })
    clearSessionPhase(session!.id)
    navigate('/', { replace: true })
  }

  const unit = settings?.unit ?? 'kg'
  const showPlates = settings?.showPlates ?? true

  return (
    <div className="page session">
      <header className="stack stack--tight">
        <div className="row-between">
          <h1>{t('session.title')}</h1>
          <span className="mono muted">
            {t('session.progress_exercises', { done: progress.done, planned: progress.planned })}
          </span>
        </div>
        <div className="progress">
          <div
            className="progress__fill"
            style={{ width: `${progress.planned ? (progress.done / progress.planned) * 100 : 0}%` }}
          />
        </div>
      </header>

      {phase === 'preparacao' && (
        <Card tone="hot" title={t('session.prep')}>
          <strong className="clock">{formatClock(remainingSeconds(phaseStartedAt, PREP_SECONDS, now))}</strong>
          <p className="muted">{t('session.prep_desc')}</p>
          <button type="button" className="button button--primary" onClick={() => setPhase('exercicios')}>
            {t('session.start_exercises')}
          </button>
        </Card>
      )}

      {phase !== 'cardio' && (
        <SessionExerciseChecklist sessionId={session.id} items={items} logs={logs} />
      )}

      {items.length > 0 && (phase === 'cardio' || !slot) && (
        <Card title={t('session.cardio')}>
          <strong className="clock">
            {formatClock(remainingSeconds(phaseStartedAt, template?.cardioDurationSeconds ?? CARDIO_SECONDS, now))}
          </strong>
          <p className="muted">{t('session.cardio_desc')}</p>

          {cardioOptions.length > 0 ? (
            <Select label={t('session.modality')} value={cardioOptionId} onChange={setCardioOptionId}>
              <option value="">{t('session.cardio_none')}</option>
              {cardioOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </Select>
          ) : (
            <p className="muted">{t('session.cardio_not_configured')}</p>
          )}

          <span className="eyebrow">{t('session.intensity')}</span>
          <div className="pills">
            {(['leve', 'moderado', 'forte'] as const).map((level) => (
              <button
                key={level}
                type="button"
                className={`pill${intensity === level ? ' pill--on' : ''}`}
                onClick={() => setIntensity(level)}
              >
                {t(`session.${level}`)}
              </button>
            ))}
          </div>
        </Card>
      )}

      <SetHistory logs={logs} items={items} unit={unit} showPlates={showPlates} />

      <button type="button" className="button button--danger" onClick={() => void finish()}>
        {t('session.finish')}
      </button>
    </div>
  )
}

function SetHistory({ logs, items, unit, showPlates }: {
  logs: SetLog[]
  items: TemplateItem[]
  unit: 'kg' | 'lb'
  showPlates: boolean
}) {
  const { t } = useTranslation()
  const exercises = useExercises()
  if (logs.length === 0) return null

  const byItem = new Map(items.map((i) => [i.id, i]))
  const byExercise = new Map(exercises.map((e) => [e.id, e]))
  const nameOf = (id: string) => byExercise.get(id)?.name ?? t('library.gone')

  return (
    <Card title={t('history.sets', { count: logs.filter((l) => !l.isWarmup).length })}>
      <ul className="loglist">
        {logs.map((log) => (
          <li key={log.id} className={log.skipped ? 'loglist__row loglist__row--skip' : 'loglist__row'}>
            <span>{nameOf(log.exerciseId)}</span>
            <span className="mono muted">
              {log.skipped
                ? t('common.skip')
                : [
                    formatLoad(log.weightKg, log.plateCount, unit, showPlates, sideLabel(byExercise.get(log.exerciseId), t)),
                    log.reps !== null ? `${log.reps} ${t('session.reps')}` : `${log.seconds}s`,
                    log.rir !== null ? `RIR ${log.rir}` : null,
                    log.isWarmup ? t('session.warmup') : null,
                    log.hadPain ? t('session.pain') : null,
                  ].filter(Boolean).join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
