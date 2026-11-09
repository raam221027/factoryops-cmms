import { CalendarX, PackageX, XOctagon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { lowStockParts, overduePmSchedules } from '@/domain/metrics'
import type { Equipment, PmSchedule, SparePart } from '@/domain/types'
import { formatRelativeDay } from '@/lib/format'
import { cn } from '@/lib/utils'

const LIMIT = 5

function Column({ icon: Icon, title, count, to, children }: { icon: typeof CalendarX; title: string; count: number; to: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <Badge tone={count ? 'danger' : 'success'}>{count}</Badge>
        <Link to={to} className="ml-auto text-xs text-primary hover:underline">
          View all
        </Link>
      </div>
      {count === 0 ? <p className="py-2 text-sm text-muted-foreground">Nothing to flag.</p> : <ul className="divide-y">{children}</ul>}
    </div>
  )
}

export function NeedsAttention({ equipment, parts, schedules, className }: { equipment: Equipment[]; parts: SparePart[]; schedules: PmSchedule[]; className?: string }) {
  const overdue = overduePmSchedules(schedules).sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
  const low = lowStockParts(parts).sort((a, b) => a.quantityOnHand / Math.max(1, a.minimumStock) - b.quantityOnHand / Math.max(1, b.minimumStock))
  const down = equipment.filter((e) => e.status === 'OutOfService')
  const name = new Map(equipment.map((e) => [e.id, e]))

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-3">
        <Column icon={CalendarX} title="Overdue PM" count={overdue.length} to="/admin/pm">
          {overdue.slice(0, LIMIT).map((s) => (
            <li key={s.id} className="py-1.5 text-sm">
              <p className="truncate">{name.get(s.equipmentId)?.name}</p>
              <p className="text-xs text-danger">Due {formatRelativeDay(s.nextDueDate)}</p>
            </li>
          ))}
        </Column>
        <Column icon={PackageX} title="Low stock" count={low.length} to="/admin/inventory">
          {low.slice(0, LIMIT).map((p) => (
            <li key={p.id} className="py-1.5 text-sm">
              <p className="truncate">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-warning">{p.quantityOnHand}</span> on hand · min {p.minimumStock}
              </p>
            </li>
          ))}
        </Column>
        <Column icon={XOctagon} title="Out of service" count={down.length} to="/admin/equipment">
          {down.slice(0, LIMIT).map((e) => (
            <li key={e.id} className="py-1.5 text-sm">
              <Link to={`/admin/equipment/${e.id}`} className="block truncate hover:underline">
                {e.name}
              </Link>
              <p className="text-xs text-muted-foreground">{e.assetId}</p>
            </li>
          ))}
        </Column>
      </CardContent>
    </Card>
  )
}
