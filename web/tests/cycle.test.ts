import { describe, expect, it } from 'vitest'
import {
  assignCycleNumbers, averageIntervalDays, blockJustClosed, currentStreak, cyclePosition,
  groupSessionsByBlock, nextTemplate,
} from '../src/lib/domain/cycle'

const templates = [
  { id: 'a', position: 0, name: 'Treino A' },
  { id: 'b', position: 1, name: 'Treino B' },
  { id: 'c', position: 2, name: 'Treino C' },
]

const session = (templateId: string, startedAt: string, status = 'concluida') => ({
  templateId, startedAt, status,
})

describe('nextTemplate', () => {
  it('sem histórico, começa pelo primeiro slot do ciclo', () => {
    expect(nextTemplate(templates, [])?.id).toBe('a')
  })

  it('gira para o slot seguinte ao último feito', () => {
    expect(nextTemplate(templates, [session('a', '2026-08-01')])?.id).toBe('b')
  })

  it('fecha a volta e recomeça', () => {
    const done = [session('a', '2026-08-01'), session('b', '2026-08-03'), session('c', '2026-08-05')]
    expect(nextTemplate(templates, done)?.id).toBe('a')
  })

  it('decide pelo mais recente, não pela ordem do array', () => {
    const fora = [session('c', '2026-08-05'), session('a', '2026-08-01')]
    expect(nextTemplate(templates, fora)?.id).toBe('a')
  })

  it('sessão incompleta também avança — não trava o rodízio', () => {
    const done = [session('a', '2026-08-01', 'incompleta')]
    expect(nextTemplate(templates, done)?.id).toBe('b')
  })

  it('sessão em andamento não avança nada', () => {
    const done = [session('a', '2026-08-01'), session('b', '2026-08-03', 'em_andamento')]
    expect(nextTemplate(templates, done)?.id).toBe('b')
  })

  it('template apagado depois de usado recomeça o ciclo em vez de travar', () => {
    expect(nextTemplate(templates, [session('sumido', '2026-08-01')])?.id).toBe('a')
  })

  it('sem templates, não há o que sugerir', () => {
    expect(nextTemplate([], [session('a', '2026-08-01')])).toBeNull()
  })

  it('ordena por position, não pela ordem de criação', () => {
    const fora = [templates[2]!, templates[0]!, templates[1]!]
    expect(nextTemplate(fora, [])?.id).toBe('a')
  })
})

describe('cyclePosition', () => {
  it('primeira sessão está no ciclo 1, bloco 1', () => {
    expect(cyclePosition(2, 4, 0)).toMatchObject({ cycleNumber: 1, blockNumber: 1 })
  })

  it('fechar o ciclo avança o número do ciclo', () => {
    expect(cyclePosition(2, 4, 2).cycleNumber).toBe(2)
  })

  it('quatro ciclos de duas sessões fecham o bloco 1', () => {
    expect(cyclePosition(2, 4, 8)).toMatchObject({ cycleNumber: 5, blockNumber: 2 })
  })

  it('conta quantas sessões faltam para fechar o bloco', () => {
    expect(cyclePosition(2, 4, 3).sessionsToBlockEnd).toBe(5)
  })

  it('trata configuração degenerada sem dividir por zero', () => {
    expect(cyclePosition(0, 0, 5).cycleNumber).toBe(6)
  })
})

describe('blockJustClosed', () => {
  it('não sinaliza antes da primeira sessão', () => {
    expect(blockJustClosed(2, 4, 0)).toBe(false)
  })

  it('sinaliza exatamente na sessão que fecha o bloco', () => {
    expect(blockJustClosed(2, 4, 8)).toBe(true)
    expect(blockJustClosed(2, 4, 7)).toBe(false)
    expect(blockJustClosed(2, 4, 9)).toBe(false)
  })
})

describe('currentStreak', () => {
  it('conta sessões concluídas seguidas, de trás para frente', () => {
    const done = [session('a', '2026-08-01'), session('b', '2026-08-03'), session('a', '2026-08-05')]
    expect(currentStreak(done)).toBe(3)
  })

  it('uma incompleta zera a sequência', () => {
    const done = [
      session('a', '2026-08-01'),
      session('b', '2026-08-03', 'incompleta'),
      session('a', '2026-08-05'),
    ]
    expect(currentStreak(done)).toBe(1)
  })
})

describe('averageIntervalDays', () => {
  it('precisa de pelo menos duas sessões', () => {
    expect(averageIntervalDays([session('a', '2026-08-01')])).toBeNull()
  })

  it('calcula o intervalo médio observado', () => {
    const done = [
      session('a', '2026-08-01T10:00:00Z'),
      session('b', '2026-08-03T10:00:00Z'),
      session('a', '2026-08-07T10:00:00Z'),
    ]
    expect(averageIntervalDays(done)).toBe(3)
  })
})

describe('assignCycleNumbers', () => {
  const s = (id: string, at: string, status = 'concluida') => ({ templateId: id, startedAt: at, status })

  it('numera pela ordem cronológica, não pela ordem do array', () => {
    const list = [s('b', '2026-08-03'), s('a', '2026-08-01'), s('a', '2026-08-05')]
    const map = assignCycleNumbers(list, 2, 4)

    expect(map.get(list[1]!)?.cycleNumber).toBe(1)
    expect(map.get(list[0]!)?.cycleNumber).toBe(1)
    expect(map.get(list[2]!)?.cycleNumber).toBe(2)
  })

  it('apagar uma sessão faz as seguintes ocuparem o lugar dela', () => {
    const todas = [s('a', '2026-08-01'), s('b', '2026-08-03'), s('a', '2026-08-05'), s('b', '2026-08-07')]
    const semASegunda = [todas[0]!, todas[2]!, todas[3]!]

    // Com as quatro, a terceira abre o ciclo 2. Sem a segunda, ela fecha o 1.
    expect(assignCycleNumbers(todas, 2, 4).get(todas[2]!)?.cycleNumber).toBe(2)
    expect(assignCycleNumbers(semASegunda, 2, 4).get(todas[2]!)?.cycleNumber).toBe(1)
  })

  it('ignora sessão em andamento — ela ainda não ocupou lugar no ciclo', () => {
    const list = [s('a', '2026-08-01'), s('b', '2026-08-03', 'em_andamento')]
    const map = assignCycleNumbers(list, 2, 4)

    expect(map.get(list[1]!)).toBeUndefined()
    expect(map.size).toBe(1)
  })

  it('sessão incompleta ocupa lugar, porque consumiu o slot', () => {
    const list = [s('a', '2026-08-01', 'incompleta'), s('b', '2026-08-03')]
    expect(assignCycleNumbers(list, 2, 4).get(list[1]!)?.cycleNumber).toBe(1)
  })
})

describe('groupSessionsByBlock', () => {
  const s = (id: string, at: string, status = 'concluida') => ({ templateId: id, startedAt: at, status })

  it('agrupa do bloco e ciclo mais recentes para os mais antigos', () => {
    const sessions = Array.from({ length: 5 }, (_, index) => s('a', `2026-08-0${index + 1}`))
    const groups = groupSessionsByBlock(sessions, 2, 2)

    expect(groups.map((group) => group.blockNumber)).toEqual([2, 1])
    expect(groups[0]?.cycles[0]?.cycleNumber).toBe(3)
    expect(groups[1]?.cycles.map((cycle) => cycle.cycleNumber)).toEqual([2, 1])
  })

  it('mostra a sessão em andamento no ciclo atual sem avançá-lo', () => {
    const open = s('b', '2026-08-02', 'em_andamento')
    const groups = groupSessionsByBlock([s('a', '2026-08-01'), open], 2, 2)

    expect(groups[0]?.cycles[0]?.sessions).toEqual([open, expect.objectContaining({ templateId: 'a' })])
  })
})
