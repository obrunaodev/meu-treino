import { describe, expect, it } from 'vitest'
import { sideLabel } from '../src/lib/labels'

const t = (key: string) => (key === 'session.per_side_short' ? 'lado' : key)

describe('sideLabel', () => {
  it('devolve a palavra quando o exercício é de carga por lado', () => {
    expect(sideLabel({ loadPerSide: true }, t)).toBe('lado')
  })

  it('devolve null na máquina comum', () => {
    expect(sideLabel({ loadPerSide: false }, t)).toBeNull()
  })

  it('exercício salvo antes da coluna existir não é tratado como por lado', () => {
    expect(sideLabel({} as { loadPerSide: boolean }, t)).toBeNull()
    expect(sideLabel(undefined, t)).toBeNull()
  })
})
