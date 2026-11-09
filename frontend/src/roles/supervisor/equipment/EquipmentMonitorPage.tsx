import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { AlertTriangle, Gauge, Timer, Wrench } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { EquipmentStatusBadge } from '@/components/shared/badges'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filters'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState, ErrorState, KpiSkeletonRow, ListSkeleton } from '@/components/shared/states'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/toggles'
import { EQUIPMENT_STATUS_LABELS, type EquipmentStatus } from '@/domain/enums'
import { downtimeHours, equipmentStatusCounts } from '@/domain/metrics'
import type { Equipment, EquipmentDowntime, WorkOrder } from '@/domain/types'
import { isOpen } from '@/domain/workOrderRules'
import { useDowntimes, useEquipmentList, useLookups, type Lookups } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { formatHours } from '@/lib/format'
import { cn, matchesQuery } from '@/lib/utils'

const STATUS_ORDER: Record<EquipmentStatus, number> = { OutOfService: 0, UnderMaintenance: 1, Operational: 2, Retired: 3 }
const STATUS_BAR: Record<EquipmentStatus, string> = {
  OutOfService: 'border-l-danger',
  UnderMaintenance: 'border-l-warning',
  Operational: 'border-l-success',
  Retired: 'border-l-border',
}
const ACTIVE_STATUSES = ['Operational', 'UnderMaintenance', 'OutOfService'] as const

interface Tile {
  e: Equipment
  open: WorkOrder[]
  active?: WorkOrder
  down?: EquipmentDowntime
}

export function EquipmentMonitorPage() {
  const equipment = useEquipmentList()
  const workOrders = useWorkOrders()
  const downtimes = useDowntimes()
  const { lookups, ready, error } = useLookups()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<EquipmentStatus | ''>('')
  const [departmentId, setDepartmentId] = useState('')
  const [issuesOnly, setIssuesOnly] = useState(false)
  const failed = equipment.error ?? workOrders.error ?? downtimes.error ?? error

  const groups = useMemo(() => {
    if (!equipment.data || !workOrders.data || !downtimes.data) return null
    const openByEq = new Map<string, WorkOrder[]>()
    for (const wo of workOrders.data.filter(isOpen)) (openByEq.get(wo.equipmentId) ?? openByEq.set(wo.equipmentId, []).get(wo.equipmentId)!).push(wo)
    const downByEq = new Map(downtimes.data.filter((d) => !d.endUtc).map((d) => [d.equipmentId, d]))
    const tiles: Tile[] = equipment.data
      .filter((e) => e.status !== 'Retired')
      .filter((e) => (!status || e.status === status) && (!departmentId || e.departmentId === departmentId) && (!issuesOnly || e.status !== 'Operational' || openByEq.has(e.id)))
      .filter((e) => matchesQuery(search, e.name, e.assetId, e.model))
      .map((e) => {
        const open = openByEq.get(e.id) ?? []
        return { e, open, active: open.find((wo) => wo.status === 'InProgress'), down: downByEq.get(e.id) }
      })
      .sort((a, b) => STATUS_ORDER[a.e.status] - STATUS_ORDER[b.e.status] || a.e.assetId.localeCompare(b.e.assetId))
    const byLocation = new Map<string, Tile[]>()
    for (const t of tiles) (byLocation.get(t.e.locationId) ?? byLocation.set(t.e.locationId, []).get(t.e.locationId)!).push(t)
    return [...byLocation.entries()]
      .map(([locationId, items]) => ({ locationId, label: lookups.locationLabel(items[0].e.id), items }))
      .sort((a, b) => STATUS_ORDER[a.items[0].e.status] - STATUS_ORDER[b.items[0].e.status] || a.label.localeCompare(b.label))
  }, [equipment.data, workOrders.data, downtimes.data, status, departmentId, issuesOnly, search, lookups])

  const counts = equipment.data ? equipmentStatusCounts(equipment.data) : null
  const ongoing = (downtimes.data ?? []).filter((d) => !d.endUtc)

  return (
    <>
      <PageHeader title="Equipment status" description="Live view of machines across production areas, problems first." />
      {failed ? (
        <ErrorState error={failed} onRetry={() => (void equipment.refetch(), void workOrders.refetch(), void downtimes.refetch())} />
      ) : !counts || !groups || !ready ? (
        <div className="space-y-4">
          <KpiSkeletonRow />
          <ListSkeleton rows={6} />
        </div>
      ) : (
        <div className="space-y-4">
          <section aria-label="Fleet status" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Operational" value={counts.operational} icon={Gauge} tone="success" hint={`of ${counts.total} active machines`} />
            <KpiCard label="Under maintenance" value={counts.underMaintenance} icon={Wrench} tone="warning" />
            <KpiCard label="Out of service" value={counts.outOfService} icon={AlertTriangle} tone="danger" />
            <KpiCard label="Down right now" value={formatHours(downtimeHours(ongoing))} icon={Timer} tone="danger" hint={`${ongoing.length} ongoing stoppage${ongoing.length === 1 ? '' : 's'}`} />
          </section>

          <Card>
            <FilterBar className="border-b-0">
              <SearchInput value={search} onChange={setSearch} placeholder="Search machine or asset ID…" className="sm:w-64" />
              <FilterSelect label="Status" value={status} onChange={setStatus} options={ACTIVE_STATUSES.map((s) => ({ value: s, label: EQUIPMENT_STATUS_LABELS[s] }))} />
              <FilterSelect label="Department" value={departmentId} onChange={setDepartmentId} options={[...lookups.departments.values()].map((d) => ({ value: d.id, label: d.name }))} />
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={issuesOnly} onCheckedChange={setIssuesOnly} />
                Only machines with issues or open work
              </label>
            </FilterBar>
          </Card>

          {groups.length === 0 ? (
            <EmptyState title="No machines match" description="Clear the filters to see the whole fleet." />
          ) : (
            groups.map((g) => (
              <section key={g.locationId} aria-label={g.label}>
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {g.label}
                  <span className="text-xs font-normal text-muted-foreground">{lookups.departments.get(g.items[0].e.departmentId)?.name}</span>
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {g.items.map((t) => (
                    <li key={t.e.id}>
                      <EquipmentTile t={t} lookups={lookups} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </>
  )
}

function EquipmentTile({ t, lookups }: { t: Tile; lookups: Lookups }) {
  const { e } = t
  return (
    <Link to={`/supervisor/equipment/${e.id}`} className={cn('block h-full rounded-lg border border-l-4 bg-surface p-3 shadow-card transition-colors hover:border-primary/40', STATUS_BAR[e.status])}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{e.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{e.assetId}</p>
        </div>
        <EquipmentStatusBadge status={e.status} />
      </div>
      <div className="mt-2 space-y-1 text-xs">
        {t.down && (
          <p className="font-medium text-danger">
            Down for {formatDistanceToNowStrict(parseISO(t.down.startUtc))} · {t.down.reason}
          </p>
        )}
        {t.active ? (
          <p className="truncate text-info">
            {lookups.userName(t.active.assigneeId)} working on {t.active.number}
          </p>
        ) : t.open.length > 0 ? (
          <p className="text-muted-foreground">
            {t.open.length} open work order{t.open.length > 1 ? 's' : ''}
            {t.open.some((wo) => !wo.assigneeId) && <span className="text-warning"> · needs a technician</span>}
          </p>
        ) : (
          <p className="text-muted-foreground">No open work</p>
        )}
        <div className="flex gap-1 pt-1">
          {e.criticality === 'High' && <Badge tone="warning">High criticality</Badge>}
          {t.open.some((wo) => wo.priority === 'Critical') && <Badge tone="solidDanger">Critical job</Badge>}
        </div>
      </div>
    </Link>
  )
}
