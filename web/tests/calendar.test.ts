import { describe, expect, it } from 'vitest'
import { calendarMonthDays } from '../src/lib/domain/calendar.js'

describe('calendarMonthDays', () => {
  it('fills the leading and trailing weeks with adjacent months', () => {
    const days = calendarMonthDays(2026, 8)

    expect(days).toHaveLength(42)
    expect(days[0]).toEqual({ key: '2026-08-30', day: 30, inCurrentMonth: false })
    expect(days.find((day) => day.key === '2026-09-01')?.inCurrentMonth).toBe(true)
    expect(days.at(-1)).toEqual({ key: '2026-10-10', day: 10, inCurrentMonth: false })
  })

  it('keeps a month starting on Sunday aligned without leading blanks', () => {
    expect(calendarMonthDays(2026, 10)[0]).toEqual({
      key: '2026-11-01', day: 1, inCurrentMonth: true,
    })
  })
})
