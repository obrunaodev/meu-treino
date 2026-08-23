import { describe, expect, it } from 'vitest'
import { resolveDeleteVsEdit, threeWayMerge } from '../src/lib/merge.js'

describe('threeWayMerge', () => {
  const base = { name: 'Leg press', restSeconds: 90, sets: 3 }

  it('aplica a mudança do cliente quando o servidor não tocou no campo', () => {
    const result = threeWayMerge(base, { ...base }, { ...base, restSeconds: 120 })
    expect(result).toEqual({ kind: 'apply', row: { restSeconds: 120 } })
  })

  it('ignora campos que o cliente devolveu sem alterar', () => {
    const server = { ...base, name: 'Leg press horizontal' }
    const result = threeWayMerge(base, server, { ...base, sets: 4 })
    expect(result).toEqual({ kind: 'apply', row: { sets: 4 } })
  })

  it('não conflita quando os dois lados fizeram a MESMA mudança', () => {
    const result = threeWayMerge(base, { ...base, sets: 4 }, { ...base, sets: 4 })
    expect(result).toEqual({ kind: 'noop' })
  })

  it('conflita só nos campos que os dois lados mudaram para valores diferentes', () => {
    const server = { ...base, sets: 4, name: 'Leg press 45' }
    const client = { ...base, sets: 5, restSeconds: 120 }
    const result = threeWayMerge(base, server, client)

    expect(result.kind).toBe('conflict')
    if (result.kind !== 'conflict') throw new Error('esperava conflito')
    expect(result.conflictingFields).toEqual(['sets'])
    // O que não conflitou é aplicado: o usuário não perde o resto do trabalho.
    expect(result.row).toEqual({ restSeconds: 120 })
  })

  it('sem base, trata como primeira escrita e aceita o cliente', () => {
    const result = threeWayMerge(null, { ...base }, { ...base, sets: 9 })
    expect(result).toEqual({ kind: 'apply', row: { ...base, sets: 9 } })
  })

  it('sem base e sem divergência, não escreve', () => {
    expect(threeWayMerge(null, { ...base }, { ...base })).toEqual({ kind: 'noop' })
  })

  it('nunca deixa o cliente escrever campos do servidor', () => {
    const client = { ...base, rev: 999n, ownerId: 'outro-usuario', sets: 4 }
    const result = threeWayMerge(base, { ...base }, client)
    expect(result).toEqual({ kind: 'apply', row: { sets: 4 } })
  })

  it('compara arrays JSON por conteúdo, não por referência', () => {
    const withPlates = { plateTable: [10, 15, 22] }
    const result = threeWayMerge(withPlates, { plateTable: [10, 15, 22] }, { plateTable: [10, 15, 22] })
    expect(result).toEqual({ kind: 'noop' })
  })

  it('detecta mudança real dentro de um array JSON', () => {
    const result = threeWayMerge(
      { plateTable: [10, 15] },
      { plateTable: [10, 15] },
      { plateTable: [10, 15, 22] },
    )
    expect(result).toEqual({ kind: 'apply', row: { plateTable: [10, 15, 22] } })
  })

  it('trata numeric do Postgres (string) e number do cliente como iguais', () => {
    const result = threeWayMerge({ weightKg: '60.00' }, { weightKg: '60.00' }, { weightKg: '60.00' })
    expect(result).toEqual({ kind: 'noop' })
  })

  it('compara datas por valor', () => {
    const at = new Date('2026-08-19T10:00:00Z')
    const result = threeWayMerge(
      { completedAt: at },
      { completedAt: new Date(at) },
      { completedAt: new Date(at) },
    )
    expect(result).toEqual({ kind: 'noop' })
  })
})

describe('resolveDeleteVsEdit', () => {
  it('edit ressuscita o registro apagado no outro dispositivo', () => {
    expect(resolveDeleteVsEdit(true, false, 2)).toBe('resurrect')
  })

  it('delete do cliente vence quando o servidor não mexeu', () => {
    expect(resolveDeleteVsEdit(false, true, 0)).toBe('delete')
  })

  it('delete dos dois lados não gera trabalho', () => {
    expect(resolveDeleteVsEdit(true, true, 0)).toBe('keep')
  })

  it('delete no servidor sem edição no cliente permanece apagado', () => {
    expect(resolveDeleteVsEdit(true, false, 0)).toBe('keep')
  })
})

describe('metadados fora do diff', () => {
  const base = { name: 'Leg press', sets: 3, updatedAt: '2026-08-19T10:00:00Z' }

  it('updatedAt divergente sozinho não vira conflito', () => {
    const server = { ...base, updatedAt: '2026-08-19T11:00:00Z' }
    const client = { ...base, updatedAt: '2026-08-19T12:00:00Z' }
    expect(threeWayMerge(base, server, client)).toEqual({ kind: 'noop' })
  })

  it('edições em campos distintos convivem, apesar do updatedAt diferente', () => {
    const server = { ...base, name: 'Leg press 45', updatedAt: '2026-08-19T11:00:00Z' }
    const client = { ...base, sets: 4, updatedAt: '2026-08-19T12:00:00Z' }
    expect(threeWayMerge(base, server, client)).toEqual({ kind: 'apply', row: { sets: 4 } })
  })
})
