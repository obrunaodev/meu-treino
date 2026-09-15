import { describe, expect, it } from 'vitest'
import {
  AUTO_CLOSE_AFTER_MS, elapsedSeconds, finalStatus, formatClock, nextSlot,
  exerciseExecutionStatus, exerciseProgress, groupByExercise, initialSetDraft, prefillSource, prescribedResult, previousSetForDraft, remainingSeconds, restCommandForToggle, restFor,
  sessionProgress, shouldAutoClose, topWorkingSet,
} from '../src/lib/domain/session'

const items = [
  { id: 'i1', sets: 3, restSeconds: null },
  { id: 'i2', sets: 2, restSeconds: 120 },
]

const set = (templateItemId: string, setIndex: number, extra: Partial<{ isWarmup: boolean; skipped: boolean }> = {}) => ({
  templateItemId, setIndex, isWarmup: false, skipped: false, ...extra,
})

describe('tempo derivado de instante absoluto', () => {
  const base = new Date('2026-08-20T10:00:00Z').getTime()

  it('o tempo decorrido não depende de nenhum contador em memória', () => {
    const since = new Date(base).toISOString()
    expect(elapsedSeconds(since, base + 90_000)).toBe(90)
  })

  it('sobrevive ao app ficar em segundo plano por minutos', () => {
    const since = new Date(base).toISOString()
    expect(remainingSeconds(since, 120, base + 300_000)).toBe(0)
    expect(remainingSeconds(since, 120, base + 45_000)).toBe(75)
  })

  it('nunca devolve tempo negativo se o relógio andar para trás', () => {
    const since = new Date(base).toISOString()
    expect(elapsedSeconds(since, base - 10_000)).toBe(0)
  })

  it('formata como relógio', () => {
    expect(formatClock(75)).toBe('1:15')
    expect(formatClock(9)).toBe('0:09')
    expect(formatClock(600)).toBe('10:00')
  })
})

describe('nextSlot', () => {
  it('começa no primeiro item, primeira série', () => {
    expect(nextSlot(items, [])).toEqual({ itemIndex: 0, setIndex: 0 })
  })

  it('avança dentro do mesmo exercício', () => {
    expect(nextSlot(items, [set('i1', 0)])).toEqual({ itemIndex: 0, setIndex: 1 })
  })

  it('passa para o próximo exercício quando as séries fecham', () => {
    const done = [set('i1', 0), set('i1', 1), set('i1', 2)]
    expect(nextSlot(items, done)).toEqual({ itemIndex: 1, setIndex: 0 })
  })

  it('aquecimento não avança o slot', () => {
    expect(nextSlot(items, [set('i1', 0, { isWarmup: true })])).toEqual({ itemIndex: 0, setIndex: 0 })
  })

  it('exercício pulado sai da fila', () => {
    const done = [set('i1', 0, { skipped: true }), set('i1', 1, { skipped: true }), set('i1', 2, { skipped: true })]
    expect(nextSlot(items, done)).toEqual({ itemIndex: 1, setIndex: 0 })
  })

  it('tudo resolvido, não há próximo slot', () => {
    const done = [set('i1', 0), set('i1', 1), set('i1', 2), set('i2', 0), set('i2', 1)]
    expect(nextSlot(items, done)).toBeNull()
  })
})

describe('sessionProgress', () => {
  it('conta séries de trabalho contra o planejado', () => {
    expect(sessionProgress(items, [set('i1', 0), set('i1', 1)])).toMatchObject({ done: 2, planned: 5 })
  })

  it('série extra adicionada na hora aumenta o planejado', () => {
    const done = Array.from({ length: 6 }, (_, i) => set('i1', i))
    expect(sessionProgress(items, done).planned).toBe(6)
  })

  it('aquecimento não entra na conta', () => {
    expect(sessionProgress(items, [set('i1', 0, { isWarmup: true })]).done).toBe(0)
  })
})

describe('exerciseProgress', () => {
  it('só marca o exercício depois de todas as séries prescritas', () => {
    expect(exerciseProgress(items, [set('i1', 0), set('i1', 1)])).toEqual({
      done: 0, planned: 2, remaining: 2,
    })
    expect(exerciseProgress(items, [set('i1', 0), set('i1', 1), set('i1', 2)])).toEqual({
      done: 1, planned: 2, remaining: 1,
    })
  })

  it('não considera exercício pulado como concluído', () => {
    const skipped = [0, 1, 2].map((index) => set('i1', index, { skipped: true }))
    expect(exerciseProgress(items, skipped).done).toBe(0)
  })
})

describe('exerciseExecutionStatus', () => {
  it('keeps a skipped exercise separate from pending and done', () => {
    expect(exerciseExecutionStatus(items[0]!, [])).toBe('pending')
    expect(exerciseExecutionStatus(items[0]!, [set('i1', 0, { skipped: true })])).toBe('skipped')
    expect(exerciseExecutionStatus(items[0]!, [set('i1', 0), set('i1', 1), set('i1', 2)])).toBe('done')
  })
})

describe('prescribedResult', () => {
  it('registra o teto da faixa configurada', () => {
    expect(prescribedResult(10, 15)).toBe(15)
  })

  it('aceita prescrição de valor único', () => {
    expect(prescribedResult(12, null)).toBe(12)
  })
})

describe('previousSetForDraft', () => {
  const previous = [
    { setIndex: 0, weightKg: 70 },
    { setIndex: 1, weightKg: 65 },
  ]

  it('prefills the first set from the matching set of the previous session', () => {
    expect(previousSetForDraft([], previous, 0, 'full')?.weightKg).toBe(70)
  })

  it('copies the immediately preceding set during the current session', () => {
    const current = [{ setIndex: 0, weightKg: 80 }]
    expect(previousSetForDraft(current, previous, 1, 'full')?.weightKg).toBe(80)
    expect(previousSetForDraft(current, previous, 1, 'compact')?.weightKg).toBe(80)
  })
})

describe('prefillSource', () => {
  const session = (id: string, templateId: string, day: number) => ({ id, templateId, startedAt: `2026-08-${String(day).padStart(2, '0')}T10:00:00Z` })
  const log = (sessionId: string, setIndex: number, extra: Partial<{ exerciseId: string; isWarmup: boolean; skipped: boolean }> = {}) => ({
    sessionId, setIndex, exerciseId: 'supino', isWarmup: false, skipped: false, ...extra,
  })
  const current = session('hoje', 'a', 28)

  it('fica no mesmo treino mesmo quando outro treino é mais recente', () => {
    const sessions = [session('a1', 'a', 10), session('b1', 'b', 20), current]
    const source = prefillSource(current, sessions, [log('a1', 0), log('b1', 0)], 'supino')
    expect(source).toMatchObject({ origin: 'template', session: { id: 'a1' } })
  })

  it('passa por sessões do mesmo treino em que o exercício não teve série de trabalho', () => {
    const sessions = [session('a1', 'a', 5), session('a2', 'a', 12), session('a3', 'a', 19), current]
    const logs = [log('a1', 0), log('a2', 0, { skipped: true }), log('a3', 0, { isWarmup: true })]
    expect(prefillSource(current, sessions, logs, 'supino')?.session.id).toBe('a1')
  })

  it('traz a sessão anterior do mesmo treino com o exercício para o conselho de progressão', () => {
    const sessions = [session('a1', 'a', 5), session('a2', 'a', 12), session('a3', 'a', 19), current]
    const source = prefillSource(current, sessions, [log('a1', 0), log('a3', 1), log('a3', 0)], 'supino')
    expect(source?.session.id).toBe('a3')
    expect(source?.sets.map((set) => set.setIndex)).toEqual([0, 1])
    expect(source?.earlierSets.map((set) => set.sessionId)).toEqual(['a1'])
  })

  it('sem histórico no mesmo treino, usa a última vez em qualquer treino', () => {
    const sessions = [session('b1', 'b', 10), session('c1', 'c', 20), current]
    const source = prefillSource(current, sessions, [log('b1', 0), log('c1', 0)], 'supino')
    expect(source).toMatchObject({ origin: 'other_workout', session: { id: 'c1' }, earlierSets: [] })
  })

  it('ignora a própria sessão, sessões posteriores e outros exercícios', () => {
    const sessions = [current, session('a9', 'a', 30), session('b1', 'b', 10)]
    const logs = [log('hoje', 0), log('a9', 0), log('b1', 0, { exerciseId: 'remada' })]
    expect(prefillSource(current, sessions, logs, 'supino')).toBeNull()
  })
})

describe('initialSetDraft', () => {
  const item = { repMin: 10, repMax: 12, rirTarget: 2, isTimeBased: false, trackingMode: 'full' as const }
  const log = (setIndex: number, weightKg: number, reps: number, rir: number) => ({
    setIndex, weightKg, plateCount: null, reps, seconds: null, rir,
  })
  const fromTemplate = { origin: 'template' as const, session: null, sets: [log(0, 60, 11, 1), log(1, 55, 10, 2)], earlierSets: [] }
  const fromOther = { origin: 'other_workout' as const, session: null, sets: [log(0, 80, 5, 0), log(1, 82.5, 5, 1)], earlierSets: [] }

  it('do mesmo treino copia carga, repetições e esforço por série no modo completo', () => {
    expect(initialSetDraft(item, 1, undefined, fromTemplate)).toEqual({ kg: 55, plate: null, result: 10, rir: 2, checked: false })
  })

  it('do mesmo treino no modo compacto repete a última série', () => {
    expect(initialSetDraft({ ...item, trackingMode: 'compact' }, 0, undefined, fromTemplate)).toMatchObject({ kg: 55, result: 10 })
  })

  it('de outro treino copia só a carga da última série; repetições e esforço seguem a prescrição', () => {
    expect(initialSetDraft(item, 0, undefined, fromOther)).toEqual({ kg: 82.5, plate: null, result: 12, rir: 2, checked: false })
  })

  it('exercício por tempo vindo de outro treino recebe os segundos prescritos', () => {
    const timed = { repMin: 30, repMax: 45, rirTarget: null, isTimeBased: true }
    expect(initialSetDraft(timed, 0, undefined, fromOther)).toMatchObject({ kg: 82.5, result: 45, rir: null })
  })

  it('o que já foi feito hoje vence e vem marcado', () => {
    expect(initialSetDraft(item, 0, log(0, 70, 12, 2), fromOther)).toEqual({ kg: 70, plate: null, result: 12, rir: 2, checked: true })
  })

  it('sem histórico nenhum, só a prescrição', () => {
    expect(initialSetDraft(item, 0, undefined, null)).toEqual({ kg: null, plate: null, result: 12, rir: 2, checked: false })
  })
})

describe('restCommandForToggle', () => {
  const toggle = (patch: Partial<Parameters<typeof restCommandForToggle>[0]> = {}) => restCommandForToggle({
    setIndex: 0, sets: 3, nextChecked: true, nextSetChecked: false, activeRestAfter: null, autoStart: true, ...patch,
  })

  it('com a preferência desligada não mexe no descanso', () => {
    expect(toggle({ autoStart: false })).toBeNull()
    expect(toggle({ autoStart: false, nextChecked: false, activeRestAfter: 0 })).toBeNull()
  })

  it('marcar uma série do meio inicia o descanso dela', () => {
    expect(toggle()).toEqual({ kind: 'start', afterSetIndex: 0 })
  })

  it('não inicia quando a série seguinte já está marcada', () => {
    expect(toggle({ nextSetChecked: true })).toBeNull()
  })

  it('marcar outra série reinicia a contagem para ela', () => {
    expect(toggle({ setIndex: 1, activeRestAfter: 0 })).toEqual({ kind: 'start', afterSetIndex: 1 })
  })

  it('marcar a série que já está descansando não reinicia', () => {
    expect(toggle({ activeRestAfter: 0 })).toBeNull()
  })

  it('a última série não abre intervalo, e encerra o que estiver correndo', () => {
    expect(toggle({ setIndex: 2 })).toBeNull()
    expect(toggle({ setIndex: 2, activeRestAfter: 1 })).toEqual({ kind: 'stop' })
  })

  it('desmarcar encerra só o descanso da própria série', () => {
    expect(toggle({ nextChecked: false, activeRestAfter: 0 })).toEqual({ kind: 'stop' })
    expect(toggle({ setIndex: 1, nextChecked: false, activeRestAfter: 0 })).toBeNull()
  })
})

describe('restFor', () => {
  it('usa o descanso do exercício quando existe', () => {
    expect(restFor(items[1], 90)).toBe(120)
  })

  it('cai no padrão do programa quando o exercício não define', () => {
    expect(restFor(items[0], 90)).toBe(90)
    expect(restFor(undefined, 90)).toBe(90)
  })
})

describe('finalStatus', () => {
  it('tudo resolvido é concluída', () => {
    const done = [set('i1', 0), set('i1', 1), set('i1', 2), set('i2', 0), set('i2', 1)]
    expect(finalStatus(items, done)).toBe('concluida')
  })

  it('exercício pulado deixa a sessão incompleta', () => {
    const done = [
      set('i1', 0, { skipped: true }), set('i1', 1, { skipped: true }), set('i1', 2, { skipped: true }),
      set('i2', 0), set('i2', 1),
    ]
    expect(finalStatus(items, done)).toBe('incompleta')
  })

  it('sair no meio é incompleta', () => {
    expect(finalStatus(items, [set('i1', 0)])).toBe('incompleta')
  })
})

describe('shouldAutoClose', () => {
  const base = new Date('2026-08-20T10:00:00Z').getTime()

  it('fecha após 6h sem registro', () => {
    const last = new Date(base).toISOString()
    expect(shouldAutoClose(last, base + AUTO_CLOSE_AFTER_MS)).toBe(true)
  })

  it('não fecha antes disso', () => {
    const last = new Date(base).toISOString()
    expect(shouldAutoClose(last, base + AUTO_CLOSE_AFTER_MS - 1000)).toBe(false)
  })
})

describe('groupByExercise', () => {
  const log = (exerciseId: string, setIndex: number, completedAt: string, extra: Partial<{
    isWarmup: boolean; skipped: boolean; weightKg: number | null
  }> = {}) => ({
    exerciseId, setIndex, completedAt,
    isWarmup: false, skipped: false, weightKg: 100,
    ...extra,
  })

  it('junta as séries de um exercício num grupo só', () => {
    const groups = groupByExercise([
      log('supino', 0, '2026-08-20T10:00:00Z'),
      log('remada', 0, '2026-08-20T10:10:00Z'),
      log('supino', 1, '2026-08-20T10:03:00Z'),
    ])

    expect(groups.map((g) => g.exerciseId)).toEqual(['supino', 'remada'])
    expect(groups[0].logs).toHaveLength(2)
  })

  it('ordena os grupos por quando o exercício começou, não pelo setIndex', () => {
    // A remada foi primeiro, mesmo tendo série de índice maior na lista.
    const groups = groupByExercise([
      log('supino', 0, '2026-08-20T10:30:00Z'),
      log('remada', 3, '2026-08-20T10:00:00Z'),
    ])

    expect(groups.map((g) => g.exerciseId)).toEqual(['remada', 'supino'])
  })

  it('ordena pelo check de trabalho, não por um aquecimento anterior', () => {
    const groups = groupByExercise([
      log('supino', 0, '2026-08-20T10:00:00Z', { isWarmup: true }),
      log('remada', 0, '2026-08-20T10:05:00Z'),
      log('supino', 0, '2026-08-20T10:10:00Z'),
    ])

    expect(groups.map((group) => group.exerciseId)).toEqual(['remada', 'supino'])
  })

  it('ordena as séries dentro do grupo por setIndex', () => {
    const groups = groupByExercise([
      log('supino', 2, '2026-08-20T10:06:00Z'),
      log('supino', 0, '2026-08-20T10:00:00Z'),
      log('supino', 1, '2026-08-20T10:03:00Z'),
    ])

    expect(groups[0].logs.map((l) => l.setIndex)).toEqual([0, 1, 2])
  })

  it('cai no createdAt quando a série não tem completedAt', () => {
    const groups = groupByExercise([
      { ...log('supino', 0, ''), completedAt: null, createdAt: '2026-08-20T10:30:00Z' },
      { ...log('remada', 0, ''), completedAt: null, createdAt: '2026-08-20T10:00:00Z' },
    ])

    expect(groups.map((g) => g.exerciseId)).toEqual(['remada', 'supino'])
  })

  it('lista vazia não vira grupo', () => {
    expect(groupByExercise([])).toEqual([])
  })
})

describe('topWorkingSet', () => {
  const log = (setIndex: number, weightKg: number | null, extra: Partial<{
    isWarmup: boolean; skipped: boolean
  }> = {}) => ({
    exerciseId: 'supino', setIndex, weightKg, completedAt: null,
    isWarmup: false, skipped: false,
    ...extra,
  })

  it('é a série mais pesada', () => {
    expect(topWorkingSet([log(0, 80), log(1, 100), log(2, 90)])?.weightKg).toBe(100)
  })

  it('ignora aquecimento e série pulada, mesmo se forem as mais pesadas', () => {
    const top = topWorkingSet([
      log(0, 200, { isWarmup: true }),
      log(1, 180, { skipped: true }),
      log(2, 90),
    ])

    expect(top?.weightKg).toBe(90)
  })

  it('sem série de trabalho com carga, não há representante', () => {
    expect(topWorkingSet([log(0, null), log(1, 120, { skipped: true })])).toBeNull()
  })
})
