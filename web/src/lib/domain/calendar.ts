export interface CalendarDay {
  key: string
  day: number
  inCurrentMonth: boolean
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Returns a calendar key in the viewer's local timezone. */
export function calendarDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Dias de calendário local entre o instante e `to`: 0 no mesmo dia, 1 cruzando a meia-noite. */
export function calendarDaysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso)
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  // round, não floor: dia de horário de verão tem 23 ou 25 horas.
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000)
}

/** Completes only the partial first and last weeks with adjacent-month days. */
export function calendarMonthDays(year: number, month: number): CalendarDay[] {
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const occupiedCells = firstWeekday + daysInMonth
  const trailingDays = (7 - (occupiedCells % 7)) % 7
  return Array.from({ length: occupiedCells + trailingDays }, (_, index) => {
    const date = new Date(year, month, index - firstWeekday + 1)
    return {
      key: calendarDayKey(date),
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === month && date.getFullYear() === year,
    }
  })
}
