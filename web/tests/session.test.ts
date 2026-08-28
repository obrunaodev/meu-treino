import { describe, expect, it } from 'vitest'
import {
  AUTO_CLOSE_AFTER_MS, elapsedSeconds, finalStatus, formatClock, nextSlot,
  exerciseProgress, groupByExercise, prescribedResult, remainingSeconds, restFor,
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

  it('considera exercício pulado como resolvido', () => {
    const skipped = [0, 1, 2].map((index) => set('i1', index, { skipped: true }))
    expect(exerciseProgress(items, skipped).done).toBe(1)
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

  it('exercício pulado ainda conta como resolvido', () => {
    const done = [
      set('i1', 0, { skipped: true }), set('i1', 1, { skipped: true }), set('i1', 2, { skipped: true }),
      set('i2', 0), set('i2', 1),
    ]
    expect(finalStatus(items, done)).toBe('concluida')
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
