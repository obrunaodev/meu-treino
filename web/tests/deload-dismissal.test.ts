import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissDeload, isDeloadDismissed } from '../src/lib/deload-dismissal.js'

const block = { periodNumber: 1, blockNumber: 2 }

beforeEach(() => localStorage.clear())

describe('dispensa do aviso de semana leve', () => {
  it('lembra a dispensa daquele bloco, e só dele', () => {
    expect(isDeloadDismissed('p', block)).toBe(false)

    dismissDeload('p', block)

    expect(isDeloadDismissed('p', block)).toBe(true)
    expect(isDeloadDismissed('p', { periodNumber: 1, blockNumber: 3 })).toBe(false)
    expect(isDeloadDismissed('outro-programa', block)).toBe(false)
  })

  it('sem storage disponível, o aviso volta em vez de quebrar', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('modo privado') })
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('modo privado') })

    expect(() => dismissDeload('p', block)).not.toThrow()
    expect(isDeloadDismissed('p', block)).toBe(false)

    setItem.mockRestore()
    getItem.mockRestore()
  })
})
