import { describe, expect, it } from 'vitest'
import {
  MAX_SUPERSET_SIZE, blockRestSeconds, leaveSupersetChange, linkWithNextPatches, moveBlock,
  moveWithinGroup, planBlocks, supersetKind, supersetRounds, ungroupPatches, type GroupedItem,
} from '../src/lib/domain/supersets'

const item = (id: string, supersetGroup: string | null = null, extra: Partial<GroupedItem> = {}): GroupedItem =>
  ({ id, sets: 3, restSeconds: null, supersetGroup, ...extra })

describe('planBlocks', () => {
  it('agrupa vizinhos com a mesma chave e deixa o resto solto', () => {
    const blocks = planBlocks([item('a', 'g1'), item('b', 'g1'), item('c'), item('d', 'g2')])
    expect(blocks.map((block) => block.items.map((entry) => entry.id))).toEqual([['a', 'b'], ['c'], ['d']])
  })

  it('mesma chave separada pela ordem vira dois blocos', () => {
    const blocks = planBlocks([item('a', 'g1'), item('c'), item('b', 'g1')])
    expect(blocks.map((block) => block.items.length)).toEqual([1, 1, 1])
  })

  it('chave ausente e null são a mesma coisa', () => {
    const blocks = planBlocks([{ id: 'a', sets: 3, restSeconds: null }, item('b')])
    expect(blocks).toHaveLength(2)
  })
})

describe('supersetKind', () => {
  it('nomeia o grupo pelo tamanho', () => {
    expect(supersetKind(1)).toBeNull()
    expect(supersetKind(2)).toBe('biset')
    expect(supersetKind(MAX_SUPERSET_SIZE)).toBe('triset')
    expect(supersetKind(4)).toBe('giant')
  })
})

describe('blockRestSeconds', () => {
  it('usa o descanso do último membro, com o padrão como reserva', () => {
    const block = { key: 'g1', items: [item('a', 'g1', { restSeconds: 30 }), item('b', 'g1', { restSeconds: 120 })] }
    expect(blockRestSeconds(block, 90)).toBe(120)
    expect(blockRestSeconds({ key: 'g1', items: [item('a', 'g1')] }, 90)).toBe(90)
  })
})

describe('supersetRounds', () => {
  it('alterna as séries dos membros, rodada a rodada', () => {
    const rounds = supersetRounds([item('a', 'g1', { sets: 2 }), item('b', 'g1', { sets: 2 })])
    expect(rounds).toEqual([
      [{ itemId: 'a', setIndex: 0 }, { itemId: 'b', setIndex: 0 }],
      [{ itemId: 'a', setIndex: 1 }, { itemId: 'b', setIndex: 1 }],
    ])
  })

  it('membro com menos séries some das últimas rodadas', () => {
    const rounds = supersetRounds([item('a', 'g1', { sets: 4 }), item('b', 'g1', { sets: 3 })])
    expect(rounds).toHaveLength(4)
    expect(rounds.at(-1)).toEqual([{ itemId: 'a', setIndex: 3 }])
  })

  it('membro pulado sai das rodadas', () => {
    const rounds = supersetRounds([item('a', 'g1', { sets: 2 }), item('b', 'g1', { sets: 2 })], new Set(['b']))
    expect(rounds.flat().every((entry) => entry.itemId === 'a')).toBe(true)
  })
})

describe('mover', () => {
  const items = [item('a', 'g1'), item('b', 'g1'), item('c'), item('d')]

  it('o bloco inteiro anda junto', () => {
    expect(moveBlock(items, 0, 1)).toEqual(['c', 'a', 'b', 'd'])
    expect(moveBlock(items, 1, -1)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('não há para onde mover nas pontas', () => {
    expect(moveBlock(items, 0, -1)).toBeNull()
    expect(moveBlock(items, 2, 1)).toBeNull()
  })

  it('dentro do grupo, o membro troca com o vizinho e para nas bordas', () => {
    expect(moveWithinGroup(items, 'a', 1)).toEqual(['b', 'a', 'c', 'd'])
    expect(moveWithinGroup(items, 'a', -1)).toBeNull()
    expect(moveWithinGroup(items, 'b', 1)).toBeNull()
    expect(moveWithinGroup(items, 'c', 1)).toBeNull()
  })
})

describe('agrupar e desagrupar', () => {
  it('grupo novo recebe o id do primeiro membro como chave', () => {
    const items = [item('a'), item('b')]
    expect(linkWithNextPatches(items, 'a', 'fresh')).toEqual([
      { id: 'a', supersetGroup: 'a' },
      { id: 'b', supersetGroup: 'a' },
    ])
  })

  it('dois aparelhos criando o mesmo bi-set escrevem o mesmo valor', () => {
    const items = [item('a'), item('b')]
    expect(linkWithNextPatches(items, 'a', 'x')).toEqual(linkWithNextPatches(items, 'a', 'y'))
  })

  it('id já usado como chave de outro grupo cai na chave nova', () => {
    const items = [item('z', 'a'), item('a'), item('b')]
    expect(linkWithNextPatches(items, 'a', 'fresh')).toEqual([
      { id: 'a', supersetGroup: 'fresh' },
      { id: 'b', supersetGroup: 'fresh' },
    ])
  })

  it('entrar num grupo existente só escreve o membro novo', () => {
    const items = [item('a', 'g1'), item('b', 'g1'), item('c')]
    expect(linkWithNextPatches(items, 'b', 'fresh')).toEqual([{ id: 'c', supersetGroup: 'g1' }])
  })

  it('não passa do tamanho máximo, nem liga o último item a nada', () => {
    const cheio = [item('a', 'g1'), item('b', 'g1'), item('c', 'g1'), item('d')]
    expect(linkWithNextPatches(cheio, 'c', 'fresh')).toEqual([])
    expect(linkWithNextPatches([item('a')], 'a', 'fresh')).toEqual([])
  })

  it('sair do grupo solta a chave e põe o item logo depois do grupo', () => {
    const items = [item('a', 'g1'), item('b', 'g1'), item('c', 'g1'), item('d')]
    expect(leaveSupersetChange(items, 'a')).toEqual({
      order: ['b', 'c', 'a', 'd'],
      patches: [{ id: 'a', supersetGroup: null }],
    })
    expect(leaveSupersetChange(items, 'd')).toBeNull()
  })

  it('desagrupar limpa todos os membros', () => {
    const block = { key: 'g1', items: [item('a', 'g1'), item('b', 'g1')] }
    expect(ungroupPatches(block)).toEqual([
      { id: 'a', supersetGroup: null },
      { id: 'b', supersetGroup: null },
    ])
  })
})
