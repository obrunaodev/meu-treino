import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useActions } from '../lib/actions.js'
import { lbToKg, nextLoadStep, plateForKg, totalLoadKg } from '../lib/domain/load.js'
import { SESSION_RECORD_KEY, liveRecordKey, sessionRecordKinds, type ComparableSet, type RecordKind } from '../lib/domain/records.js'
import {
  initialSetDraft, logsBothSides, prefillSource, setRowsToLog, sideValues, withLeftSide, withSideValues,
  type SetDraft, type SetSide, type SideDraft,
} from '../lib/domain/session.js'
import { supersetKind, supersetRounds } from '../lib/domain/supersets.js'
import { useEquipment, useExercises, useMedia, useRecordBaselines, useSessions, useSetLogs, useSettings } from '../lib/repo.js'
import type { Equipment, Exercise, ExerciseMedia, PlanSnapshotEquipment, SetLog } from '../lib/types.js'
import { PainCapture } from './PainCapture.js'
import type { SessionChecklistItem } from './SessionExerciseChecklist.js'
import { SupersetMemberRow } from './SupersetMemberRow.js'
import { RestCard, SetCard } from './SessionSetCard.js'

/** A, B, C identificam o membro na tarja de cada série e nas ações. */
const LETTERS = ['A', 'B', 'C']

interface Member {
  item: SessionChecklistItem
  letter: string
  name: string
  exercise: Exercise | null
  gear: Equipment | PlanSnapshotEquipment | null
  media: ExerciseMedia | null
  loadPerSide: boolean
  bothSides: boolean
  /** Séries de trabalho já gravadas — o aquecimento e o pulado ficam de fora. */
  workLogs: SetLog[]
  skipped: boolean
}

/**
 * Bi-set ao vivo: as séries dos membros se alternam numa lista só, rodada a
 * rodada, e o intervalo fica no fim da rodada — que é exatamente o que
 * diferencia um bi-set de dois exercícios seguidos.
 *
 * Os rascunhos de todos os membros vivem aqui, num estado só por id. Guardar
 * cada membro no seu próprio componente pareceria mais limpo, mas as séries
 * se intercalam: a ordem visual teria que sair da ordem do DOM, e quem navega
 * por teclado ou leitor de tela receberia a sequência errada.
 */
export function SessionSupersetFlow({ sessionId, items, index, logs, activeRound, restSeconds, restRemaining, onRest, onContinue, onDone }: {
  sessionId: string
  items: SessionChecklistItem[]
  index: number
  logs: SetLog[]
  activeRound: number | null
  restSeconds: number
  restRemaining: number
  onRest: (round: number) => void
  onContinue: () => void
  onDone: () => void
}) {
  const { t } = useTranslation()
  const exercises = useExercises()
  const equipment = useEquipment()
  const allMedia = useMedia()
  const allLogs = useSetLogs()
  const sessions = useSessions()
  const settings = useSettings()
  const baselines = useRecordBaselines(items.map((item) => item.exerciseId), sessionId)
  const { logSet, removeSet, logPain } = useActions()
  const currentSession = sessions.find((entry) => entry.id === sessionId) ?? null

  const members: Member[] = items.map((item, position) => {
    const exercise = exercises.find((entry) => entry.id === item.exerciseId) ?? null
    const snapshot = 'exerciseName' in item ? item : null
    const own = logs.filter((log) => log.templateItemId === item.id && !log.isWarmup)
    return {
      item,
      letter: LETTERS[position] ?? String(position + 1),
      name: snapshot?.exerciseName ?? exercise?.name ?? t('library.gone'),
      exercise,
      gear: snapshot?.equipment ?? equipment.find((entry) => entry.id === exercise?.equipmentId) ?? null,
      media: allMedia.find((entry) => entry.exerciseId === item.exerciseId) ?? null,
      loadPerSide: snapshot?.loadPerSide ?? exercise?.loadPerSide ?? false,
      bothSides: logsBothSides(snapshot ?? exercise),
      workLogs: own.filter((log) => !log.skipped).sort((a, b) => a.setIndex - b.setIndex),
      skipped: own.length > 0 && own.every((log) => log.skipped),
    }
  })

  const sources = new Map(members.map((member) => [
    member.item.id,
    currentSession ? prefillSource(currentSession, sessions, allLogs, member.item.exerciseId) : null,
  ]))
  // Com lados separados cada lado tem a sua história: sem separar, o esquerdo
  // voltaria pré-preenchido com a carga do lado forte.
  const ofSide = <L extends { side: string }>(rows: L[], side: SetSide) =>
    rows.filter((row) => (row.side === 'E') === (side === 'E'))
  const draftOfSide = (member: Member, setIndex: number, side: SetSide) => {
    const source = sources.get(member.item.id) ?? null
    return initialSetDraft(
      member.item, setIndex,
      ofSide(member.workLogs, side).find((log) => log.setIndex === setIndex),
      source && { ...source, sets: ofSide(source.sets, side) },
    )
  }
  const initialDrafts = (): Record<string, SetDraft[]> => Object.fromEntries(members.map((member) => [
    member.item.id,
    Array.from({ length: member.item.sets }, (_, setIndex) => (member.bothSides
      ? withLeftSide(draftOfSide(member, setIndex, 'D'), draftOfSide(member, setIndex, 'E'))
      : initialSetDraft(
        member.item, setIndex, member.workLogs.find((log) => log.setIndex === setIndex), sources.get(member.item.id) ?? null,
      ))),
  ]))
  const [drafts, setDrafts] = useState<Record<string, SetDraft[]>>(initialDrafts)
  const [showPain, setShowPain] = useState(false)

  // Mesma regra do exercício sozinho: os rascunhos recomeçam quando muda a
  // fonte que os preencheu, não a cada array novo vindo do Dexie.
  // `bothSides` entra na chave: o exercício chega do IndexedDB depois do
  // primeiro render, e sem ele os rascunhos ficariam de um lado só.
  const blockKey = members.map((member) => `${member.item.id}:${member.item.sets}:${member.bothSides}`).join('|')
  const sourceKey = members.flatMap((member) => {
    const source = sources.get(member.item.id) ?? null
    return [String(source?.origin), ...[...member.workLogs, ...(source?.sets ?? [])].map((log) => `${log.id}:${log.updatedAt}`)]
  }).join('|')
  useEffect(() => setDrafts(initialDrafts()), [blockKey, sourceKey])

  const kind = supersetKind(members.length) ?? 'biset'
  const active = members.filter((member) => !member.skipped)
  const byId = new Map(members.map((member) => [member.item.id, member]))
  const rounds = supersetRounds(items, new Set(members.filter((member) => member.skipped).map((member) => member.item.id)))
  const completed = members.every((member) => member.skipped
    || new Set(member.workLogs.map((log) => log.setIndex)).size >= member.item.sets)
  const allChecked = active.length > 0 && active.every((member) => (drafts[member.item.id] ?? []).every((draft) => draft.checked))

  function updateDraft(itemId: string, setIndex: number, patch: Partial<SetDraft>) {
    setDrafts((current) => ({
      ...current,
      [itemId]: (current[itemId] ?? []).map((draft, position) => position === setIndex ? { ...draft, ...patch } : draft),
    }))
  }

  function updateSide(itemId: string, setIndex: number, side: SetSide, patch: Partial<SideDraft>) {
    setDrafts((current) => ({
      ...current,
      [itemId]: (current[itemId] ?? []).map((draft, position) => (
        position === setIndex ? withSideValues(draft, side, patch) : draft
      )),
    }))
  }

  function stepLoad(member: Member, setIndex: number, direction: 1 | -1, side: SetSide) {
    const values = sideValues((drafts[member.item.id] ?? [])[setIndex]!, side)
    updateSide(member.item.id, setIndex, side, nextLoadStep(
      member.gear ?? { loadType: 'livre', plateTable: [], incrementKg: null },
      { kg: values.kg, plate: values.plate }, direction,
    ))
  }

  function typeLoad(member: Member, setIndex: number, displayValue: number | null, side: SetSide) {
    const normalized = displayValue === null ? null : Math.min(settings?.unit === 'lb' ? 2202 : 999, Math.max(0, displayValue))
    const kg = normalized === null ? null : settings?.unit === 'lb' ? lbToKg(normalized) : normalized
    const plate = kg !== null && member.gear?.loadType === 'pino' ? plateForKg(member.gear, kg) : null
    setDrafts((current) => ({
      ...current,
      [member.item.id]: (current[member.item.id] ?? []).map((draft, position) => {
        if (position === setIndex) return withSideValues(draft, side, { kg, plate })
        // A carga informada vira o padrão das séries seguintes ainda vazias
        // — só deste exercício, nunca do outro membro do grupo.
        if (position > setIndex && sideValues(draft, side).kg === null) return withSideValues(draft, side, { kg, plate })
        return draft
      }),
    }))
  }

  const recordsOf = (member: Member) => {
    const baseline = baselines.get(member.item.exerciseId)
    if (!baseline) return new Map<string, RecordKind[]>()
    const checked = (drafts[member.item.id] ?? []).flatMap((draft, setIndex): ComparableSet[] => (draft.checked
      ? setRowsToLog(draft, member.item.isTimeBased).map((row) => ({
        key: liveRecordKey(setIndex, row.side), setIndex, totalKg: totalLoadKg(row.weightKg, member.loadPerSide),
        reps: row.reps, seconds: row.seconds, bodyweight: member.gear?.loadType === 'corporal',
      }))
      : []))
    return sessionRecordKinds(baseline, checked)
  }
  const records = new Map(members.map((member) => [member.item.id, recordsOf(member)]))
  // Cada lado concorre por conta própria, mas a bandeira é uma, no cartão da série.
  const recordsFor = (itemId: string, setIndex: number) => {
    const own = records.get(itemId)
    const kinds = [...(own?.get(liveRecordKey(setIndex, 'ambos')) ?? []), ...(own?.get(liveRecordKey(setIndex, 'E')) ?? [])]
    return kinds.length > 0 ? [...new Set(kinds)] : undefined
  }

  async function writeSets(member: Member) {
    for (const log of logs.filter((entry) => entry.templateItemId === member.item.id && !entry.isWarmup)) await removeSet(log.id)
    for (const [setIndex, draft] of (drafts[member.item.id] ?? []).entries()) {
      for (const row of setRowsToLog(draft, member.item.isTimeBased)) {
        await logSet({ sessionId, templateItemId: member.item.id, exerciseId: member.item.exerciseId, setIndex, ...row })
      }
    }
  }

  async function completeBlock() {
    if (!allChecked) return
    // O membro pulado fica como está: apagar os registros dele apagaria o pulo.
    for (const member of active) await writeSets(member)
    onDone()
  }

  async function skipMember(member: Member) {
    for (const log of logs.filter((entry) => entry.templateItemId === member.item.id && !entry.isWarmup)) await removeSet(log.id)
    for (let setIndex = 0; setIndex < member.item.sets; setIndex++) {
      await logSet({ sessionId, templateItemId: member.item.id, exerciseId: member.item.exerciseId, setIndex, skipped: true, completedAt: null })
    }
  }

  async function addWarmup(member: Member) {
    const warmups = logs.filter((log) => log.templateItemId === member.item.id && log.isWarmup)
    const warmupIndex = new Set(warmups.map((log) => log.setIndex)).size
    for (const row of setRowsToLog((drafts[member.item.id] ?? [])[0]!, member.item.isTimeBased)) {
      await logSet({ sessionId, templateItemId: member.item.id, exerciseId: member.item.exerciseId, setIndex: warmupIndex, isWarmup: true, ...row })
    }
  }

  async function reopenBlock() {
    for (const log of logs.filter((entry) => !entry.isWarmup)) await removeSet(log.id)
  }

  if (completed) return <section className="session-focus">
    <span className="session-focus__done">✓</span>
    <h2>{t(`session.superset_${kind}`)}</h2>
    <ul className="session-superset__summary">
      {members.map((member) => <li key={member.item.id} className="mono muted">
        {member.letter} · {member.name} · {member.skipped ? t('session.skipped') : '✓'}
      </li>)}
    </ul>
    <div className="row">
      <button type="button" className="button button--primary" onClick={onDone}>{t('session.back_to_exercises')}</button>
      <button type="button" className="button button--ghost" onClick={() => void reopenBlock()}>{t('session.redo_exercise')}</button>
    </div>
  </section>

  return <section className="session-focus session-superset">
    <header className="session-focus__head">
      <button type="button" className="button button--ghost" onClick={onDone}>{t('session.back_to_exercises')}</button>
      <span className="mono muted">{String(index + 1).padStart(2, '0')} · {t(`session.superset_${kind}`)}</span>
    </header>
    <ul className="session-superset__members">
      {members.map((member) => <SupersetMemberRow
        key={member.item.id}
        letter={member.letter}
        name={member.name}
        item={member.item}
        exercise={member.exercise}
        media={member.media}
        skipped={member.skipped}
        onWarmup={() => void addWarmup(member)}
        onSkip={() => void skipMember(member)}
      />)}
    </ul>
    <p className="mono muted">{t('session.rest_between_rounds', { count: restSeconds })}</p>
    <ol className="session-superset__rounds">
      {rounds.map((entries, round) => <Fragment key={round}>
        <li className="session-superset__round">
          <span className="eyebrow">{t('session.round', { n: round + 1 })}</span>
          <ol className="session-focus__sets">
            {entries.map(({ itemId, setIndex }) => {
              const member = byId.get(itemId)!
              const draft = (drafts[itemId] ?? [])[setIndex]
              if (!draft) return null
              return <SetCard
                key={itemId}
                item={member.item}
                eyebrow={`${member.letter} · ${member.name}`}
                checkLabel={t(draft.checked ? 'session.uncheck_set_of' : 'session.check_set_of', { number: setIndex + 1, name: member.name })}
                draft={draft}
                unit={settings?.unit ?? 'kg'}
                loadPerSide={member.loadPerSide}
                recordKinds={recordsFor(itemId, setIndex)}
                onToggle={() => updateDraft(itemId, setIndex, { checked: !draft.checked })}
                onTypeLoad={(value, side) => typeLoad(member, setIndex, value, side)}
                onStepLoad={(direction, side) => stepLoad(member, setIndex, direction, side)}
                onResult={(value, side) => updateSide(itemId, setIndex, side, { result: value })}
                onUpdate={(patch) => updateDraft(itemId, setIndex, patch)}
              />
            })}
          </ol>
        </li>
        {round < rounds.length - 1 && <RestCard
          active={activeRound === round}
          label={activeRound === round
            ? `${Math.floor(restRemaining / 60)}:${String(restRemaining % 60).padStart(2, '0')}`
            : t('session.rest_seconds', { count: restSeconds })}
          ariaLabel={t(activeRound === round ? 'session.stop_rest_after_round' : 'session.start_rest_after_round', { number: round + 1 })}
          onToggle={() => activeRound === round ? onContinue() : onRest(round)}
        />}
      </Fragment>)}
    </ol>
    {showPain ? <PainCapture onCancel={() => setShowPain(false)} onSave={async (regionSlug, level) => {
      await logPain({ regionSlug, level, sessionId, setLogId: logs.filter((log) => !log.isWarmup).at(-1)?.id ?? null })
      setShowPain(false)
    }} /> : <div className="session-focus__actions">
      {allChecked && members.filter((member) => records.get(member.item.id)?.has(SESSION_RECORD_KEY)).map((member) =>
        <p className="record-flag" role="status" key={member.item.id}>{member.name} · {t('records.volume_new')}</p>)}
      <button type="button" className="button button--primary" disabled={!allChecked} onClick={() => void completeBlock()}>
        {t('session.complete_superset')}
      </button>
      <button type="button" className="button button--quiet" onClick={() => setShowPain(true)}>{t('session.pain')}</button>
    </div>}
  </section>
}
