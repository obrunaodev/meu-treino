import { describe, expect, it } from 'vitest'
import { planBlocks, supersetHeading, supersetKind } from '../src/supersets.js'

/** Os mesmos casos de web/tests/supersets.test.ts, para as duas regras não se afastarem. */

const item = (id: string, supersetGroup: string | null = null) => ({ id, supersetGroup })

describe('planBlocks', () => {
  it('agrupa vizinhos com a mesma chave e deixa o resto solto', () => {
    const blocks = planBlocks([item('a', 'g1'), item('b', 'g1'), item('c'), item('d', 'g2')])
    expect(blocks.map((block) => block.items.map((entry) => entry.id))).toEqual([['a', 'b'], ['c'], ['d']])
  })

  it('mesma chave separada pela ordem vira dois blocos', () => {
    const blocks = planBlocks([item('a', 'g1'), item('c'), item('b', 'g1')])
    expect(blocks.map((block) => block.items.length)).toEqual([1, 1, 1])
  })
})

describe('supersetKind', () => {
  it('nomeia o grupo pelo tamanho', () => {
    expect(supersetKind(1)).toBeNull()
    expect(supersetKind(2)).toBe('biset')
    expect(supersetKind(3)).toBe('triset')
    expect(supersetKind(4)).toBe('giant')
  })
})

describe('supersetHeading', () => {
  it('item solto não ganha cabeçalho', () => {
    expect(supersetHeading(1)).toBeNull()
  })

  it('o cabeçalho diz o que fazer, não só o nome do grupo', () => {
    expect(supersetHeading(2)).toContain('Bi-set')
    expect(supersetHeading(2)).toContain('alterne as séries')
    expect(supersetHeading(3)).toContain('Tri-set')
  })
})
