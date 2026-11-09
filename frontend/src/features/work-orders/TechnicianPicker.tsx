import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/misc'
import type { TechnicianWorkload } from '@/domain/workload'
import { cn } from '@/lib/utils'
import { useTechnicianWorkloads } from './hooks'

const LOAD_TONE = { light: 'success', normal: 'info', heavy: 'warning' } as const

export function WorkloadSummary({ w }: { w: TechnicianWorkload }) {
  return (
    <span className="text-xs text-muted-foreground">
      {w.open.length} open
      {w.overdue > 0 && <span className="text-danger"> · {w.overdue} overdue</span>}
      {w.today > 0 && <> · {w.today} today</>}
    </span>
  )
}

/**
 * Radio list of active technicians with their current queue, so planners can see who has
 * capacity before assigning. Value "" means unassigned.
 */
export function TechnicianPicker({ value, onChange, name = 'technician', allowNone = true }: { value: string; onChange: (id: string) => void; name?: string; allowNone?: boolean }) {
  const { workloads } = useTechnicianWorkloads()
  if (!workloads) return <p className="py-4 text-sm text-muted-foreground">Loading technicians…</p>

  const option = (id: string, content: ReactNode) => (
    <label
      key={id || 'none'}
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors hover:bg-accent/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring',
        value === id && 'border-primary bg-primary-soft/60 hover:bg-primary-soft/60',
      )}
    >
      <input type="radio" name={name} value={id} checked={value === id} onChange={() => onChange(id)} className="sr-only" />
      {content}
    </label>
  )

  return (
    <div role="radiogroup" aria-label="Technician" className="grid gap-1.5">
      {allowNone &&
        option(
          '',
          <span className="py-1 text-sm text-muted-foreground">Leave unassigned</span>,
        )}
      {workloads.map((w) =>
        option(
          w.technician.id,
          <>
            <Avatar name={w.technician.name} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{w.technician.name}</span>
                <Badge tone={LOAD_TONE[w.load]}>{w.load === 'heavy' ? 'Busy' : w.load === 'light' ? 'Available' : 'Normal load'}</Badge>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {[w.technician.shift, w.technician.skills.slice(0, 3).join(', ')].filter(Boolean).join(' · ')}
              </span>
            </span>
            <WorkloadSummary w={w} />
          </>,
        ),
      )}
    </div>
  )
}
