import { addDays, addMonths, addWeeks, differenceInCalendarDays, parseISO } from 'date-fns'
import type { FrequencyUnit } from './enums'
import type { IsoDate, PmSchedule } from './types'
import { toIsoDate } from './workOrderRules'

export function addFrequency(date: Date, interval: number, unit: FrequencyUnit): Date {
  return unit === 'Day' ? addDays(date, interval) : unit === 'Week' ? addWeeks(date, interval) : addMonths(date, interval)
}

export function frequencyLabel(s: Pick<PmSchedule, 'frequencyInterval' | 'frequencyUnit'>): string {
  const unit = s.frequencyUnit.toLowerCase()
  return s.frequencyInterval === 1 ? `Every ${unit}` : `Every ${s.frequencyInterval} ${unit}s`
}

/** Upcoming due dates of an active schedule, starting at its next due date, up to `until`. */
export function projectOccurrences(s: PmSchedule, until: Date, max = 60): IsoDate[] {
  if (!s.active) return []
  const out: IsoDate[] = []
  let d = parseISO(s.nextDueDate)
  while (d <= until && out.length < max) {
    out.push(toIsoDate(d))
    d = addFrequency(d, s.frequencyInterval, s.frequencyUnit)
  }
  return out
}

export type DueState = 'overdue' | 'due-soon' | 'scheduled' | 'paused'

export function dueState(s: PmSchedule, today = new Date(), soonDays = 7): DueState {
  if (!s.active) return 'paused'
  const days = differenceInCalendarDays(parseISO(s.nextDueDate), today)
  return days < 0 ? 'overdue' : days <= soonDays ? 'due-soon' : 'scheduled'
}
