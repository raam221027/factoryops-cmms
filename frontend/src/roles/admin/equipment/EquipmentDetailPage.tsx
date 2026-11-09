import { useQuery } from '@tanstack/react-query'
import { Pencil, Printer } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { EquipmentStatusBadge, PriorityBadge, WorkOrderStatusBadge } from '@/components/shared/badges'
import { DataTable, type ColumnDef } from '@/components/shared/DataTable'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { QrCode } from '@/components/shared/QrCode'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { downtimeHours, mttrHours } from '@/domain/metrics'
import type { EquipmentDowntime, PmSchedule, WorkOrder } from '@/domain/types'
import { isOpen, isOverdue, toIsoDate } from '@/domain/workOrderRules'
import { useDowntimes, useLookups, usePmSchedules } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { equipmentQrUrl, lastDays } from '@/lib/dateRange'
import { formatDate, formatDateTime, formatHours } from '@/lib/format'
import { services } from '@/services'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children || '—'}</dd>
    </div>
  )
}

export function EquipmentDetailPage() {
  const { id = '' } = useParams()
  const equipment = useQuery({ queryKey: ['equipment', 'detail', id], queryFn: () => services.equipment.get(id) })
  const workOrders = useWorkOrders({ equipmentId: id })
  const downtimes = useDowntimes()
  const schedules = usePmSchedules()
  const { lookups } = useLookups()

  const ownDowntime = useMemo(() => (downtimes.data ?? []).filter((d) => d.equipmentId === id).sort((a, b) => b.startUtc.localeCompare(a.startUtc)), [downtimes.data, id])
  const ownSchedules = useMemo(() => (schedules.data ?? []).filter((s) => s.equipmentId === id), [schedules.data, id])

  const woColumns = useMemo<ColumnDef<WorkOrder, unknown>[]>(
    () => [
      { accessorKey: 'number', header: 'Number', cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span> },
      { accessorKey: 'title', header: 'Title', cell: ({ row }) => <span className="line-clamp-1">{row.original.title}</span> },
      { accessorKey: 'type', header: 'Type' },
      { accessorKey: 'priority', header: 'Priority', cell: ({ row }) => <PriorityBadge priority={row.original.priority} /> },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <WorkOrderStatusBadge status={row.original.status} /> },
      { id: 'assignee', header: 'Technician', accessorFn: (w) => lookups.userName(w.assigneeId) },
      { accessorKey: 'createdAtUtc', header: 'Created', cell: ({ row }) => formatDate(row.original.createdAtUtc) },
      { accessorKey: 'completedAtUtc', header: 'Completed', cell: ({ row }) => formatDate(row.original.completedAtUtc) },
    ],
    [lookups],
  )

  const downtimeColumns = useMemo<ColumnDef<EquipmentDowntime, unknown>[]>(
    () => [
      { accessorKey: 'startUtc', header: 'Started', cell: ({ row }) => formatDateTime(row.original.startUtc) },
      { accessorKey: 'endUtc', header: 'Ended', cell: ({ row }) => (row.original.endUtc ? formatDateTime(row.original.endUtc) : <Badge tone="danger">Ongoing</Badge>) },
      { id: 'duration', header: 'Duration', accessorFn: (d) => downtimeHours([d]), cell: ({ getValue }) => formatHours(getValue() as number) },
      { accessorKey: 'reason', header: 'Reason' },
    ],
    [],
  )

  const pmColumns = useMemo<ColumnDef<PmSchedule, unknown>[]>(
    () => [
      { accessorKey: 'name', header: 'Schedule' },
      { id: 'freq', header: 'Every', accessorFn: (s) => `${s.frequencyInterval} ${s.frequencyUnit.toLowerCase()}${s.frequencyInterval > 1 ? 's' : ''}` },
      { accessorKey: 'nextDueDate', header: 'Next due', cell: ({ row }) => formatDate(row.original.nextDueDate) },
      { accessorKey: 'lastCompletedDate', header: 'Last done', cell: ({ row }) => formatDate(row.original.lastCompletedDate) },
      { id: 'assignee', header: 'Technician', accessorFn: (s) => lookups.userName(s.assigneeId) },
      { accessorKey: 'active', header: 'Active', cell: ({ row }) => (row.original.active ? <Badge tone="success">Active</Badge> : <Badge>Paused</Badge>) },
    ],
    [lookups],
  )

  if (equipment.isPending) return <ListSkeleton rows={6} />
  if (equipment.error) return <ErrorState error={equipment.error} onRetry={() => void equipment.refetch()} />
  const e = equipment.data
  const wos = workOrders.data ?? []
  const last90 = lastDays(90)

  return (
    <>
      <PageHeader
        title={e.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{e.assetId}</span>
            <EquipmentStatusBadge status={e.status} />
            <Badge tone={e.criticality === 'High' ? 'warning' : 'neutral'}>{e.criticality} criticality</Badge>
          </span>
        }
        breadcrumbs={[{ label: 'Equipment', to: '/admin/equipment' }, { label: e.assetId }]}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/admin/equipment/labels?ids=${e.id}`}>
                <Printer /> Print label
              </Link>
            </Button>
            <Button asChild>
              <Link to={`/admin/equipment/${e.id}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Detail label="Category">{lookups.categories.get(e.categoryId)?.name}</Detail>
              <Detail label="Manufacturer">{e.manufacturer}</Detail>
              <Detail label="Model">{e.model}</Detail>
              <Detail label="Serial number">
                <span className="font-mono text-xs">{e.serialNumber}</span>
              </Detail>
              <Detail label="Department">{lookups.departments.get(e.departmentId)?.name}</Detail>
              <Detail label="Location">{lookups.locationLabel(e.id)}</Detail>
              <Detail label="Installed">{formatDate(e.installationDate)}</Detail>
              <Detail label="Warranty until">
                {e.warrantyExpiry ? (
                  <span className="flex items-center gap-1.5">
                    {formatDate(e.warrantyExpiry)}
                    {e.warrantyExpiry < toIsoDate(new Date()) && <Badge>Expired</Badge>}
                  </span>
                ) : null}
              </Detail>
              <Detail label="Registered">{formatDate(e.createdAtUtc)}</Detail>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>QR label</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2 text-center">
            <QrCode value={equipmentQrUrl(e.assetId)} size={148} label={`QR code for ${e.assetId}`} />
            <p className="font-mono text-sm font-semibold">{e.assetId}</p>
            <p className="text-xs text-muted-foreground">Scanning opens this asset for technicians and the breakdown report for operators.</p>
          </CardContent>
        </Card>
      </div>

      <section aria-label="Last 90 days" className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Open work orders" value={wos.filter(isOpen).length} hint={`${wos.filter((w) => isOverdue(w)).length} overdue`} />
        <KpiCard label="Breakdowns (90 d)" value={wos.filter((w) => w.type === 'Corrective' && w.status !== 'Cancelled' && new Date(w.createdAtUtc) >= last90.from).length} />
        <KpiCard label="Downtime (90 d)" value={formatHours(downtimeHours(ownDowntime, last90))} tone="danger" />
        <KpiCard label="MTTR (90 d)" value={formatHours(mttrHours(wos, last90))} />
      </section>

      <Card className="mt-4">
        <Tabs defaultValue="history">
          <TabsList className="px-3">
            <TabsTrigger value="history">Maintenance history ({wos.length})</TabsTrigger>
            <TabsTrigger value="downtime">Downtime ({ownDowntime.length})</TabsTrigger>
            <TabsTrigger value="pm">PM schedules ({ownSchedules.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="history" className="pt-0">
            <DataTable data={workOrders.data} columns={woColumns} getRowId={(w) => w.id} loading={workOrders.isPending} error={workOrders.error} emptyTitle="No work orders for this asset" initialSorting={[{ id: 'createdAtUtc', desc: true }]} pageSize={10} />
          </TabsContent>
          <TabsContent value="downtime" className="pt-0">
            <DataTable data={downtimes.data ? ownDowntime : undefined} columns={downtimeColumns} getRowId={(d) => d.id} error={downtimes.error} emptyTitle="No recorded downtime" pageSize={10} />
          </TabsContent>
          <TabsContent value="pm" className="pt-0">
            <DataTable data={schedules.data ? ownSchedules : undefined} columns={pmColumns} getRowId={(s) => s.id} error={schedules.error} emptyTitle="No preventive maintenance scheduled" pageSize={10} />
          </TabsContent>
        </Tabs>
      </Card>
    </>
  )
}
