import { describe, expect, it } from 'vitest'
import { calendarCadence } from '../src/cadence.js'

describe('calendarCadence', () => {
  it('abre outro bloco depois das semanas configuradas', () => {
    expect(calendarCadence(
      new Date('2026-01-01T12:00:00Z'), 2, 3, new Date('2026-01-16T12:00:00Z'),
    )).toEqual({ blockNumber: 2, periodNumber: 1 })
  })

  it('reinicia o bloco quando começa outro período', () => {
    expect(calendarCadence(
      new Date('2026-01-10T12:00:00Z'), 1, 1, new Date('2026-02-10T12:00:00Z'),
    )).toEqual({ blockNumber: 1, periodNumber: 2 })
  })
})
