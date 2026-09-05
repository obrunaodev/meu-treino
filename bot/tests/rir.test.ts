import { describe, expect, it } from 'vitest'
import { rirLabelPt } from '../src/rir.js'

describe('rirLabelPt', () => {
  it.each([[0, 'Muito pesado'], [1, 'Pesado'], [2, 'Moderado'], [3, 'Moderado'], [4, 'Leve']])(
    'maps %s to %s', (value, label) => expect(rirLabelPt(value)).toBe(label),
  )
})
