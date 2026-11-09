import { endOfDay, startOfDay, subDays } from 'date-fns'
import type { DateRange } from '@/domain/metrics'

export const RANGE_PRESETS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 180, label: '180 days' },
] as const

/** The last `days` calendar days including today. */
export function lastDays(days: number, now = new Date()): DateRange {
  return { from: startOfDay(subDays(now, days - 1)), to: endOfDay(now) }
}

/** URL that equipment QR labels encode; opening it routes the user to the right screen for their role. */
export function equipmentQrUrl(assetId: string): string {
  return `${window.location.origin}/equipment/${encodeURIComponent(assetId)}`
}
