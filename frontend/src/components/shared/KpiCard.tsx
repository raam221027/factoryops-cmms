import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

type Tone = 'default' | 'success' | 'warning' | 'danger' | 'info'

const TONE: Record<Tone, string> = {
  default: 'bg-primary-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
}

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  to,
}: {
  label: string
  value: string | number
  hint?: string
  icon?: LucideIcon
  tone?: Tone
  /** Makes the card a link to the underlying list */
  to?: string
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn('rounded-md p-1.5', TONE[tone])}>
            <Icon className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </>
  )
  const className = 'block rounded-lg border bg-surface p-4 shadow-card'
  return to ? (
    <Link to={to} className={cn(className, 'transition-colors hover:border-primary/40')}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
