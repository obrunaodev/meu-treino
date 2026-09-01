import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useCardioLogs, useCardioOptions, useEquipment, useExercises, usePainEvents,
  useSessions, useSetLogs, useSettings, useTemplateItems, useTemplatesEver,
} from '../lib/repo.js'
import { useActions } from '../lib/actions.js'
import { formatLoad, nextLoadStep } from '../lib/domain/load.js'
import { sideLabel } from '../lib/labels.js'
import { groupByExercise, topWorkingSet } from '../lib/domain/session.js'
import { routes } from '../lib/routes.js'
import { usePainRegions } from '../components/PainCapture.js'
import { Card, Empty, Select } from '../components/ui.js'
import type { PlanSnapshot, SetLog, TemplateItem, WorkoutSession } from '../lib/types.js'

const STATUSES = ['concluida', 'incompleta', 'em_andamento'] as const

/**
 * Uma sessão registrada, aberta para correção.
 *
 * Existe porque o registro acontece na academia, com pressa: carga errada,
 * série a mais, treino iniciado por engano. Sem edição, o único conserto seria
 * apagar tudo — e o histórico é justamente o que o app promete guardar.
 */
export function SessionDetail() {
  const { sessionId } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()

  const sessions = useSessions()
  const session = sessions.find((s) => s.id === sessionId) ?? null
  const templates = useTemplatesEver()
  const logs = useSetLogs(sessionId)
  const currentPlan = useTemplateItems(session?.templateId)
  const planned = session?.planSnapshot?.items ?? currentPlan
  const cardio = useCardioLogs(sessionId)
  const settings = useSettings()
  const { updateSession, deleteSession } = useActions()
  const [confirming, setConfirming] = useState(false)

  if (!session) return <Empty message={t('history.gone')} />

  const template = templates.find((x) => x.id === session.templateId)
  const working = logs.filter((l) => !l.isWarmup && !l.skipped)
  const date = new Date(session.startedAt)

  async function destroy() {
    await deleteSession(session!.id)
    navigate(routes.history, { replace: true })
  }

  return (
    <div className="page">
      <button type="button" className="button button--ghost" onClick={() => navigate(-1)}>
        ← {t('common.back')}
      </button>

      <header className="page__title">
        <span className="eyebrow">
          {t('dashboard.cycle', {
            cycle: session.cycleNumber,
            block: session.blockNumber,
            period: session.periodNumber ?? 1,
          })}
        </span>
        <h1>{session.planSnapshot?.templateName ?? template?.name ?? t('history.gone_template')}</h1>
        <span className="mono muted">
          {date.toLocaleString(i18n.language, { dateStyle: 'long', timeStyle: 'short' })}
          {' · '}
          {t('history.sets', { count: working.length })}
        </span>
      </header>

      <Card title={t('history.session')}>
        <Select
          label={t('history.status')}
          value={session.status}
          onChange={(value) => void updateSession(session.id, { status: value as WorkoutSession['status'] })}
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>{t(`history.${status}`)}</option>
          ))}
        </Select>

        <label className="field">
          {t('history.date')}
          <input
            type="datetime-local"
            value={toLocalInput(session.startedAt)}
            onChange={(e) => {
              if (!e.target.value) return
              void updateSession(session.id, { startedAt: new Date(e.target.value).toISOString() })
            }}
          />
        </label>

        <label className="field">
          {t('history.notes')}
          <textarea
            value={session.notes ?? ''}
            onChange={(e) => void updateSession(session.id, { notes: e.target.value || null })}
          />
        </label>

        {session.autoClosedAt && <span className="mono muted">{t('session.auto_closed')}</span>}
      </Card>

      <SetEditor
        sessionId={session.id}
        logs={logs}
        planned={planned}
        snapshot={session.planSnapshot}
        templateName={session.planSnapshot?.templateName ?? template?.name ?? null}
        unit={settings?.unit ?? 'kg'}
        showPlates={settings?.showPlates ?? true}
      />

      <CardioEditor sessionId={session.id} logs={cardio} />

      <PainList sessionId={session.id} />

      <Card title={t('settings.danger')} tone="quiet">
        <span className="mono muted">{t('history.delete_hint')}</span>
        {confirming ? (
          <div className="row">
            <button type="button" className="button button--danger" onClick={() => void destroy()}>
              {t('history.delete_session_confirm')}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <button type="button" className="button button--ghost" onClick={() => setConfirming(true)}>
            {t('history.delete')}
          </button>
        )}
      </Card>
    </div>
  )
}

/** `datetime-local` não aceita ISO com fuso; precisa do horário local sem Z. */
function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

/**
 * Séries agrupadas por exercício, um acordeão para cada.
 *
 * A lista plana misturava as séries de todos os exercícios e obrigava a abrir
 * uma por uma para descobrir de quem era. Como cada exercício acontece uma vez
 * na sessão, ele é a unidade natural de leitura — e dentro dele cada série cabe
 * numa linha só de campos, sem precisar expandir.
 */
function SetEditor({ sessionId, logs, planned, snapshot, templateName, unit, showPlates }: {
  sessionId: string
  logs: SetLog[]
  planned: TemplateItem[]
  snapshot: PlanSnapshot | null
  templateName: string | null
  unit: 'kg' | 'lb'
  showPlates: boolean
}) {
  const { t } = useTranslation()
  const exercises = useExercises()
  const equipment = useEquipment()
  const { logSet } = useActions()
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const groups = groupByExercise(logs)
  const snapshotByExercise = new Map(snapshot?.items.map((item) => [item.exerciseId, item]) ?? [])
  // `null` é "ninguém escolheu ainda" e abre o primeiro — a tela não pode
  // aparecer só com cabeçalhos fechados. `''` é o usuário tendo fechado todos.
  const openId = open ?? groups[0]?.exerciseId ?? null

  // Exercício apagado da biblioteca não apaga a série que foi feita com ele.
  const nameOf = (id: string) => snapshotByExercise.get(id)?.exerciseName ??
    exercises.find((e) => e.id === id)?.name ?? t('library.gone')
  const inSession = new Set(logs.map((l) => l.exerciseId))

  // Só o que este treino prevê. A sessão pertence a um treino específico:
  // oferecer a biblioteca inteira convida a registrar no Treino A um exercício
  // que é do B, e daí o histórico do ciclo passa a contar outra coisa.
  const itemByExercise = new Map(planned.map((item) => [item.exerciseId, item]))
  const offered = planned
    .filter((item) => !inSession.has(item.exerciseId))
    .map((item) => ({ id: item.exerciseId, name: nameOf(item.exerciseId) }))

  async function appendSet(exerciseId: string) {
    const previous = logs.filter((l) => l.exerciseId === exerciseId)
    const last = previous.at(-1)
    await logSet({
      sessionId,
      exerciseId,
      // Série nova amarra no item do treino, para o alvo de reps e RIR do plano
      // continuar valendo para ela.
      templateItemId: last?.templateItemId ?? itemByExercise.get(exerciseId)?.id ?? null,
      // A partir do maior índice, e não da contagem: com uma série apagada no
      // meio, contar repetiria um índice que já existe.
      setIndex: (last?.setIndex ?? -1) + 1,
      weightKg: last?.weightKg ?? null,
      plateCount: last?.plateCount ?? null,
      reps: last?.reps ?? 10,
      rir: last?.rir ?? 2,
    })
    setOpen(exerciseId)
  }

  return (
    <Card
      title={t('history.sets_title')}
      action={
        <button type="button" className="button button--ghost" onClick={() => setAdding((v) => !v)}>
          {t('history.add_exercise')}
        </button>
      }
    >
      {adding && (
        offered.length === 0 ? (
          <p className="muted">{t('history.all_planned_in', { treino: templateName ?? '—' })}</p>
        ) : (
          <div className="checklist">
            {offered.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                className="checkitem"
                onClick={async () => {
                  await appendSet(exercise.id)
                  setAdding(false)
                }}
              >
                <span>{exercise.name}</span>
                <span className="mono muted">+</span>
              </button>
            ))}
          </div>
        )
      )}

      {groups.length === 0 ? (
        <p className="muted">{t('history.no_sets')}</p>
      ) : (
        <div className="setgroups">
          {groups.map((group) => {
            const exercise = exercises.find((e) => e.id === group.exerciseId)
            const snapshot = snapshotByExercise.get(group.exerciseId)
            const gear = snapshot?.equipment ?? equipment.find((e) => e.id === exercise?.equipmentId) ?? null
            const perSide = snapshot?.loadPerSide ?? exercise?.loadPerSide ?? false
            const isOpen = openId === group.exerciseId
            const top = topWorkingSet(group.logs)

            return (
              <section key={group.exerciseId} className="setgroup">
                <button
                  type="button"
                  className="setgroup__head"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? '' : group.exerciseId)}
                >
                  <span className="setgroup__name">{nameOf(group.exerciseId)}</span>
                  <span className="mono muted">
                    {[
                      t('history.sets', { count: group.logs.length }),
                      top ? formatLoad(top.weightKg, top.plateCount, unit, showPlates, perSide ? t('session.per_side_short') : null) : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                  <span className="setgroup__mark mono" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                </button>

                {isOpen && (
                  <div className="setgroup__body">
                    <ol className="setrows">
                      {group.logs.map((log) => (
                        <SetRow
                          key={log.id}
                          log={log}
                          gear={gear}
                          unit={unit}
                          showPlates={showPlates}
                          perSideLabel={perSide ? t('session.per_side_short') : null}
                          label={`${nameOf(group.exerciseId)} · ${t('session.set', { n: log.setIndex + 1 })}`}
                        />
                      ))}
                    </ol>
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => void appendSet(group.exerciseId)}
                    >
                      {t('session.add_set')}
                    </button>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/**
 * Uma série em uma linha: carga, reps, RIR, lado e as duas marcas.
 *
 * A carga fica em passos e não em campo livre porque em máquina de pino o
 * próximo peso é a próxima placa, não "mais 2,5 kg" — digitar um número que a
 * máquina não tem seria registrar uma carga que não existiu.
 */
function SetRow({ log, gear, unit, showPlates, perSideLabel, label }: {
  log: SetLog
  gear: { loadType: string; plateTable: number[]; incrementKg: number | null } | null
  unit: 'kg' | 'lb'
  showPlates: boolean
  perSideLabel: string | null
  label: string
}) {
  const { t } = useTranslation()
  const { updateSet, removeSet } = useActions()

  const classes = ['setrow']
  if (log.skipped) classes.push('setrow--off')
  if (log.isWarmup) classes.push('setrow--warm')

  return (
    <li className={classes.join(' ')}>
      <span className="setrow__n mono">{log.setIndex + 1}</span>

      <div className="setrow__load">
        <button
          type="button"
          aria-label={`${label} · ${t('session.load')} −`}
          onClick={() => void step(-1)}
        >
          −
        </button>
        <span className="mono setrow__value">{formatLoad(log.weightKg, log.plateCount, unit, showPlates, perSideLabel)}</span>
        <button
          type="button"
          aria-label={`${label} · ${t('session.load')} +`}
          onClick={() => void step(1)}
        >
          +
        </button>
      </div>

      {log.seconds !== null ? (
        <label className="setrow__num">
          <input
            type="number"
            min={0}
            step={5}
            value={log.seconds}
            aria-label={`${label} · ${t('session.seconds')}`}
            onChange={(e) => void updateSet(log.id, { seconds: clamp(e.target.value) })}
          />
          <span className="mono muted">{t('session.seconds')}</span>
        </label>
      ) : (
        <label className="setrow__num">
          <input
            type="number"
            min={0}
            value={log.reps ?? 0}
            aria-label={`${label} · ${t('session.reps')}`}
            onChange={(e) => void updateSet(log.id, { reps: clamp(e.target.value) })}
          />
          <span className="mono muted">{t('session.reps')}</span>
        </label>
      )}

      <label className="setrow__num">
        <input
          type="number"
          min={0}
          value={log.rir ?? 0}
          aria-label={`${label} · ${t('session.rir')}`}
          onChange={(e) => void updateSet(log.id, { rir: clamp(e.target.value) })}
        />
        <span className="mono muted">{t('session.rir')}</span>
      </label>

      <select
        className="setrow__side"
        value={log.side}
        aria-label={`${label} · ${t('session.side')}`}
        onChange={(e) => void updateSet(log.id, { side: e.target.value as SetLog['side'] })}
      >
        <option value="ambos">{t('session.side_both')}</option>
        <option value="D">{t('session.side_right')}</option>
        <option value="E">{t('session.side_left')}</option>
      </select>

      <label className="setrow__flag">
        <input
          type="checkbox"
          checked={log.isWarmup}
          aria-label={`${label} · ${t('session.warmup')}`}
          onChange={(e) => void updateSet(log.id, { isWarmup: e.target.checked })}
        />
        <span>{t('session.warmup')}</span>
      </label>

      <label className="setrow__flag">
        <input
          type="checkbox"
          checked={log.skipped}
          aria-label={`${label} · ${t('common.skip')}`}
          onChange={(e) => void updateSet(log.id, { skipped: e.target.checked })}
        />
        <span>{t('common.skip')}</span>
      </label>

      <button
        type="button"
        className="setrow__drop"
        aria-label={`${t('history.delete_set')} · ${label}`}
        onClick={() => void removeSet(log.id)}
      >
        ×
      </button>
    </li>
  )

  function step(direction: 1 | -1) {
    const next = nextLoadStep(
      gear ?? { loadType: 'livre', plateTable: [], incrementKg: null },
      { plate: log.plateCount, kg: log.weightKg },
      direction,
    )
    return updateSet(log.id, { weightKg: next.kg, plateCount: next.plate })
  }
}

/** Campo numérico é entrada do usuário: vazio vira 0, negativo não existe. */
function clamp(raw: string): number {
  return Math.max(0, Math.round(Number(raw) || 0))
}

function CardioEditor({ sessionId, logs }: { sessionId: string; logs: ReturnType<typeof useCardioLogs> }) {
  const { t } = useTranslation()
  const options = useCardioOptions()
  const { logCardio, updateCardio, removeCardio } = useActions()
  const entry = logs[0] ?? null

  return (
    <Card
      title={t('session.cardio')}
      action={
        entry ? (
          <button type="button" className="button button--ghost" onClick={() => void removeCardio(entry.id)}>
            {t('history.delete_cardio')}
          </button>
        ) : (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => void logCardio({ sessionId, durationSeconds: 0 })}
          >
            {t('common.add')}
          </button>
        )
      }
    >
      {!entry ? (
        <p className="muted">{t('history.no_cardio')}</p>
      ) : (
        <>
          <Select
            label={t('session.modality')}
            value={entry.cardioOptionId ?? ''}
            onChange={(value) => {
              const selected = options.find((option) => option.id === value)
              void updateCardio(entry.id, {
                cardioOptionId: selected?.id ?? null,
                modality: selected?.name ?? entry.modality,
              })
            }}
          >
            {entry.modality && !entry.cardioOptionId && <option value="">{entry.modality}</option>}
            {!entry.modality && <option value="">{t('session.cardio_none')}</option>}
            {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
          </Select>

          <label className="field">
            {t('history.minutes')}
            <input
              type="number"
              min={0}
              value={Math.round(entry.durationSeconds / 60)}
              onChange={(e) => void updateCardio(entry.id, { durationSeconds: Math.max(0, Number(e.target.value)) * 60 })}
            />
          </label>

          <span className="eyebrow">{t('session.intensity')}</span>
          <div className="pills">
            {(['leve', 'moderado', 'forte'] as const).map((level) => (
              <button
                key={level}
                type="button"
                className={`pill${entry.perceivedIntensity === level ? ' pill--on' : ''}`}
                onClick={() => void updateCardio(entry.id, { perceivedIntensity: level })}
              >
                {t(`session.${level}`)}
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

function PainList({ sessionId }: { sessionId: string }) {
  const { t, i18n } = useTranslation()
  const events = usePainEvents().filter((e) => e.sessionId === sessionId)
  const regions = usePainRegions()
  const { removePain } = useActions()

  if (events.length === 0) return null

  const nameOf = (slug: string) => {
    const region = regions.find((r) => r.slug === slug)
    if (!region) return slug
    return i18n.language.startsWith('pt') ? region.namePt : region.nameEn
  }

  return (
    <Card title={t('pain.title')}>
      <ul className="loglist">
        {events.map((event) => (
          <li key={event.id} className="loglist__row">
            <span>{nameOf(event.regionSlug)}</span>
            <span className="row">
              <strong className="mono">{event.level}</strong>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void removePain(event.id)}
                aria-label={t('history.delete_pain')}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
