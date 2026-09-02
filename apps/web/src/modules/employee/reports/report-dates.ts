export function shanghaiCalendarDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(now)
}

export function shiftCalendarDate(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
