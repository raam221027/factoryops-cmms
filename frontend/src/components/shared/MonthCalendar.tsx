import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { toIsoDate } from '@/domain/workOrderRules'
import { cn } from '@/lib/utils'

export interface CalendarEvent {
  id: string
  /** yyyy-MM-dd */
  date: string
  label: string
  tone?: 'default' | 'danger' | 'warning' | 'success' | 'muted'
  onClick?: () => void
}

const TONE: Record<NonNullable<CalendarEvent['tone']>, string> = {
  default: 'bg-primary-soft text-primary',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
  muted: 'bg-muted text-muted-foreground line-through',
}

const MAX_PER_DAY = 3

/**
 * Month grid. On narrow screens it switches to an agenda list, since a 7-column grid of
 * labels is unreadable on a phone.
 */
export function MonthCalendar({ events, toolbar, initialMonth = new Date() }: { events: CalendarEvent[]; toolbar?: ReactNode; initialMonth?: Date }) {
  const [month, setMonth] = useState(startOfMonth(initialMonth))
  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) })
  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of events) (byDay.get(e.date) ?? byDay.set(e.date, []).get(e.date)!).push(e)
  const monthDays = days.filter((d) => isSameMonth(d, month) && byDay.has(toIsoDate(d)))

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => subMonths(m, 1))} aria-label="Previous month">
          <ChevronLeft />
        </Button>
        <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
          <ChevronRight />
        </Button>
        <h3 className="min-w-32 text-sm font-semibold" aria-live="polite">
          {format(month, 'MMMM yyyy')}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
          Today
        </Button>
        <div className="ml-auto">{toolbar}</div>
      </div>

      {/* Grid (tablet and up) */}
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <div className="grid grid-cols-7 border-b bg-muted/60">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const iso = toIsoDate(day)
            const list = byDay.get(iso) ?? []
            return (
              <div key={iso} className={cn('min-h-24 border-b border-r p-1 [&:nth-child(7n)]:border-r-0', !isSameMonth(day, month) && 'bg-muted/40')}>
                <div className={cn('mb-1 flex size-6 items-center justify-center rounded-full text-xs', isToday(day) ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground')}>
                  {format(day, 'd')}
                </div>
                <ul className="space-y-0.5">
                  {list.slice(0, MAX_PER_DAY).map((e) => (
                    <li key={e.id}>
                      <EventChip event={e} />
                    </li>
                  ))}
                  {list.length > MAX_PER_DAY && <li className="px-1 text-[11px] text-muted-foreground">+{list.length - MAX_PER_DAY} more</li>}
                </ul>
              </div>
            )
          })}
        </div>
      </div>

      {/* Agenda (phones) */}
      <ul className="space-y-3 md:hidden">
        {monthDays.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">Nothing scheduled this month.</li>}
        {monthDays.map((day) => (
          <li key={toIsoDate(day)}>
            <p className={cn('mb-1 text-xs font-semibold', isToday(day) ? 'text-primary' : 'text-muted-foreground')}>{format(day, 'EEE, MMM d')}</p>
            <ul className="space-y-1">
              {byDay.get(toIsoDate(day))!.map((e) => (
                <li key={e.id}>
                  <EventChip event={e} large />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

function EventChip({ event, large }: { event: CalendarEvent; large?: boolean }) {
  const cls = cn('block w-full truncate rounded-sm px-1.5 text-left', large ? 'py-2 text-sm' : 'py-0.5 text-[11px]', TONE[event.tone ?? 'default'])
  return event.onClick ? (
    <button type="button" className={cn(cls, 'hover:brightness-95')} onClick={event.onClick} title={event.label}>
      {event.label}
    </button>
  ) : (
    <span className={cls} title={event.label}>
      {event.label}
    </span>
  )
}
