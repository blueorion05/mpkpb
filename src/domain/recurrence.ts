export type RecurrenceFrequency = 'none' | 'weekly' | 'biweekly' | 'monthly'

export function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
  return value === 'none' || value === 'weekly' || value === 'biweekly' || value === 'monthly'
}

export function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function nextRecurringDate(
  dueOn: string,
  recurrence: RecurrenceFrequency,
  monthlyAnchorDay: number,
): string {
  if (
    !isDateOnly(dueOn) ||
    !isRecurrenceFrequency(recurrence) ||
    recurrence === 'none' ||
    !Number.isInteger(monthlyAnchorDay) ||
    monthlyAnchorDay < 1 ||
    monthlyAnchorDay > 31
  ) {
    throw new TypeError('A recurring schedule and valid due date are required.')
  }
  const date = new Date(`${dueOn}T00:00:00.000Z`)
  if (recurrence === 'weekly') date.setUTCDate(date.getUTCDate() + 7)
  if (recurrence === 'biweekly') date.setUTCDate(date.getUTCDate() + 14)
  if (recurrence === 'monthly') {
    const targetMonth = date.getUTCMonth() + 1
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate()
    date.setUTCDate(1)
    date.setUTCMonth(targetMonth)
    date.setUTCDate(Math.min(monthlyAnchorDay, lastDay))
  }
  if (date.getUTCFullYear() > 9999) {
    throw new RangeError('The next recurring date is outside the supported calendar range.')
  }
  return date.toISOString().slice(0, 10)
}
