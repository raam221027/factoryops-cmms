import { endOfDay, format, parseISO, startOfDay } from 'date-fns'
import { Input } from '@/components/ui/input'
import type { DateRange } from '@/domain/metrics'
import { lastDays, RANGE_PRESETS } from '@/lib/dateRange'
import { cn } from '@/lib/utils'

/** Preset buttons plus custom from/to dates (native inputs work well on touch devices). */
export function DateRangePicker({ value, onChange, presets = RANGE_PRESETS, showCustom = true, className }: { value: DateRange; onChange: (r: DateRange) => void; presets?: readonly { days: number; label: string }[]; showCustom?: boolean; className?: string }) {
  const activeDays = presets.find((p) => {
    const r = lastDays(p.days)
    return r.from.getTime() === value.from.getTime() && Math.abs(r.to.getTime() - value.to.getTime()) < 60_000
  })?.days

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <div className="flex max-w-full flex-wrap rounded-md border bg-surface p-0.5" role="group" aria-label="Date range">
        {presets.map((p) => (
          <button
            key={p.days}
            type="button"
            aria-pressed={activeDays === p.days}
            onClick={() => onChange(lastDays(p.days))}
            className={cn('rounded px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground', activeDays === p.days && 'bg-primary text-primary-foreground hover:text-primary-foreground')}
          >
            {p.label}
          </button>
        ))}
      </div>
      {showCustom && (
        <div className="flex w-full items-center gap-1.5 text-xs text-muted-foreground sm:w-auto">
          <Input
            type="date"
            aria-label="From date"
            className="h-8 w-0 min-w-0 flex-1 sm:w-36 sm:flex-none"
            value={format(value.from, 'yyyy-MM-dd')}
            max={format(value.to, 'yyyy-MM-dd')}
            onChange={(e) => e.target.value && onChange({ from: startOfDay(parseISO(e.target.value)), to: value.to })}
          />
          <span>to</span>
          <Input
            type="date"
            aria-label="To date"
            className="h-8 w-0 min-w-0 flex-1 sm:w-36 sm:flex-none"
            value={format(value.to, 'yyyy-MM-dd')}
            min={format(value.from, 'yyyy-MM-dd')}
            onChange={(e) => e.target.value && onChange({ from: value.from, to: endOfDay(parseISO(e.target.value)) })}
          />
        </div>
      )}
    </div>
  )
}
