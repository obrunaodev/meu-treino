import { describe, expect, it } from 'vitest'
import { preferAlive } from '../src/lib/catalog-user.js'

describe('preferAlive', () => {
  it('prefere o registro ativo à cópia apagada da mesma estação', () => {
    const deleted = { id: 'old', code: '01', deletedAt: new Date() }
    const active = { id: 'active', code: '01', deletedAt: null }

    expect(preferAlive([deleted, active], (row) => row.code).get('01')).toBe(active)
    expect(preferAlive([active, deleted], (row) => row.code).get('01')).toBe(active)
  })

  it('não indexa registros sem vínculo com o catálogo', () => {
    const custom = { id: 'custom', code: null, deletedAt: null }
    expect(preferAlive([custom], (row) => row.code).size).toBe(0)
  })
})
