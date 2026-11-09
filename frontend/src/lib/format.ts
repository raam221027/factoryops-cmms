import { differenceInMinutes, format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns'

export function formatDate(iso?: string): string {
  return iso ? format(parseISO(iso), 'MMM d, yyyy') : '—'
}

export function formatDateTime(iso?: string): string {
  return iso ? format(parseISO(iso), 'MMM d, yyyy · HH:mm') : '—'
}

/** "Today", "Tomorrow", "Yesterday" or a short date. */
export function formatRelativeDay(iso?: string): string {
  if (!iso) return '—'
  const d = parseISO(iso)
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d')
}

export function formatAgo(iso?: string): string {
  if (!iso) return '—'
  const d = parseISO(iso)
  return Date.now() - d.getTime() < 60_000 ? 'just now' : `${formatDistanceToNowStrict(d)} ago`
}

export function formatHours(hours: number | null | undefined): string {
  if (hours == null) return '—'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  return `${hours.toFixed(1)} h`
}

export function formatPercent(ratio: number | null | undefined): string {
  return ratio == null ? '—' : `${Math.round(ratio * 100)}%`
}

const currency = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
export function formatCurrency(value: number): string {
  return currency.format(value)
}

export function formatNumber(value: number): string {
  return value.toLocaleString()
}

/** Running time since a moment: "45 min", "2 h 10 min", "3 d 4 h". */
export function formatElapsed(fromIso: string, now = new Date()): string {
  const minutes = Math.max(0, differenceInMinutes(now, parseISO(fromIso)))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ${minutes % 60} min`
  return `${Math.floor(hours / 24)} d ${hours % 24} h`
}
