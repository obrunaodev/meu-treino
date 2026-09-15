import { describe, expect, it } from 'vitest'
import { calendarDayKey, calendarDaysBetween, calendarMonthDays } from '../src/lib/domain/calendar.js'

describe('calendarDaysBetween', () => {
  it('conta dias de calendário local, não períodos de 24 horas', () => {
    expect(calendarDaysBetween(new Date(2026, 8, 15, 8, 0).toISOString(), new Date(2026, 8, 15, 22, 0))).toBe(0)
    expect(calendarDaysBetween(new Date(2026, 8, 15, 23, 50).toISOString(), new Date(2026, 8, 16, 0, 10))).toBe(1)
    expect(calendarDaysBetween(new Date(2026, 8, 12, 18, 0).toISOString(), new Date(2026, 8, 15, 7, 0))).toBe(3)
  })
})

describe('calendarMonthDays', () => {
  it('identifies a day using local calendar fields', () => {
    expect(calendarDayKey(new Date(2026, 8, 8, 23, 59))).toBe('2026-09-08')
  })

  it('fills the leading and trailing weeks with adjacent months', () => {
    const days = calendarMonthDays(2026, 8)

    expect(days).toHaveLength(35)
    expect(days[0]).toEqual({ key: '2026-08-30', day: 30, inCurrentMonth: false })
    expect(days.find((day) => day.key === '2026-09-01')?.inCurrentMonth).toBe(true)
    expect(days.at(-1)).toEqual({ key: '2026-10-03', day: 3, inCurrentMonth: false })
  })

  it('keeps a month starting on Sunday aligned without leading blanks', () => {
    expect(calendarMonthDays(2026, 10)[0]).toEqual({
      key: '2026-11-01', day: 1, inCurrentMonth: true,
    })
  })

  it('adds no adjacent dates when the month already fills complete weeks', () => {
    const days = calendarMonthDays(2026, 1)
    expect(days).toHaveLength(28)
    expect(days.every((day) => day.inCurrentMonth)).toBe(true)
  })
})
