export interface CalendarDay {
  key: string
  day: number
  inCurrentMonth: boolean
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Builds a stable six-week month grid including adjacent-month days. */
export function calendarMonthDays(year: number, month: number): CalendarDay[] {
  const firstWeekday = new Date(year, month, 1).getDay()
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month, index - firstWeekday + 1)
    return {
      key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === month && date.getFullYear() === year,
    }
  })
}
