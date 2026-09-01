/** Calcula bloco e período do bot com a mesma âncora de calendário usada pela web. */
export function calendarCadence(anchor: Date, blockWeeks: number, periodMonths: number, at: Date) {
  let elapsedMonths = (at.getFullYear() - anchor.getFullYear()) * 12 + at.getMonth() - anchor.getMonth()
  if (addMonths(anchor, elapsedMonths) > at) elapsedMonths -= 1
  const periodNumber = Math.floor(Math.max(0, elapsedMonths) / periodMonths) + 1
  const periodStart = addMonths(anchor, (periodNumber - 1) * periodMonths)
  const blockMs = blockWeeks * 7 * 86_400_000
  const blockNumber = Math.floor(Math.max(0, at.getTime() - periodStart.getTime()) / blockMs) + 1
  return { blockNumber, periodNumber }
}

function addMonths(date: Date, months: number) {
  const result = new Date(date)
  result.setDate(1)
  result.setMonth(result.getMonth() + months)
  result.setDate(Math.min(date.getDate(), new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()))
  return result
}
