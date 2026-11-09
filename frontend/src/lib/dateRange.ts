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

/**
 * Asset ID from scanned QR content. Labels encode `<origin>/equipment/<assetId>`; plain asset
 * IDs (older labels, barcodes) are accepted as they are. Returns null for anything else.
 */
export function assetIdFromScan(text: string): string | null {
  const value = text.trim()
  try {
    const url = new URL(value)
    const match = url.pathname.match(/\/equipment\/([^/]+)\/?$/)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return /^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/.test(value) ? value : null
  }
}
