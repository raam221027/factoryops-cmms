import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { PriorityBadge, RequestStatusBadge } from '@/components/shared/badges'
import { CellStack, DataTable, type ColumnDef } from '@/components/shared/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filters'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PRIORITIES, PROBLEM_CATEGORY_LABELS, REQUEST_STATUSES, type Priority, type RequestStatus } from '@/domain/enums'
import type { MaintenanceRequest } from '@/domain/types'
import { useLookups } from '@/features/shared/queries'
import { useRequests } from '@/features/work-orders/hooks'
import { formatAgo } from '@/lib/format'
import { cn, matchesQuery } from '@/lib/utils'
import { RequestReviewDialog } from './RequestReviewDialog'

const TAB_LABEL: Record<RequestStatus, string> = { Submitted: 'Awaiting review', Approved: 'Approved', Rejected: 'Rejected' }
const SEVERITY_RANK: Record<Priority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }

export function RequestsPage() {
  const [params, setParams] = useSearchParams()
  const requests = useRequests()
  const { lookups, ready, error } = useLookups()
  const tab = (REQUEST_STATUSES.includes(params.get('tab') as RequestStatus) ? params.get('tab') : 'Submitted') as RequestStatus
  const search = params.get('q') ?? ''
  const severity = (params.get('severity') ?? '') as Priority | ''
  const openId = params.get('id')

  function setParam(key: string, value: string | null) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      // Opening a request adds a history entry so Back closes it.
      { replace: !(key === 'id' && value) },
    )
  }

  const counts = useMemo(() => {
    const c: Record<RequestStatus, number> = { Submitted: 0, Approved: 0, Rejected: 0 }
    for (const r of requests.data ?? []) c[r.status]++
    return c
  }, [requests.data])

  const rows = useMemo(() => {
    const list = (requests.data ?? []).filter((r) => {
      if (r.status !== tab) return false
      if (severity && r.severity !== severity) return false
      const e = lookups.equipment.get(r.equipmentId)
      return matchesQuery(search, r.number, r.description, e?.name, e?.assetId, lookups.userName(r.requestedById, ''), PROBLEM_CATEGORY_LABELS[r.category])
    })
    // The review queue is worked most severe first, then oldest first; history is newest first.
    return tab === 'Submitted'
      ? list.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || a.createdAtUtc.localeCompare(b.createdAtUtc))
      : list.sort((a, b) => (b.reviewedAtUtc ?? b.createdAtUtc).localeCompare(a.reviewedAtUtc ?? a.createdAtUtc))
  }, [requests.data, tab, severity, search, lookups])

  const columns = useMemo<ColumnDef<MaintenanceRequest, unknown>[]>(
    () => [
      { accessorKey: 'number', header: 'Request', cell: ({ row }) => <span className="font-mono text-xs">{row.original.number}</span> },
      {
        id: 'equipment',
        header: 'Equipment',
        accessorFn: (r) => lookups.equipmentName(r.equipmentId),
        cell: ({ row }) => {
          const e = lookups.equipment.get(row.original.equipmentId)
          return <CellStack primary={e?.name ?? 'Unknown equipment'} secondary={`${e?.assetId ?? ''} · ${lookups.locationLabel(row.original.equipmentId)}`} />
        },
      },
      {
        id: 'problem',
        header: 'Problem',
        accessorFn: (r) => PROBLEM_CATEGORY_LABELS[r.category],
        cell: ({ row }) => <CellStack primary={PROBLEM_CATEGORY_LABELS[row.original.category]} secondary={row.original.description} />,
      },
      {
        accessorKey: 'severity',
        header: 'Severity',
        sortingFn: (a, b) => SEVERITY_RANK[a.original.severity] - SEVERITY_RANK[b.original.severity],
        cell: ({ row }) => <PriorityBadge priority={row.original.severity} />,
      },
      { id: 'by', header: 'Reported by', accessorFn: (r) => lookups.userName(r.requestedById, 'Unknown') },
      { accessorKey: 'createdAtUtc', header: 'Reported', cell: ({ row }) => formatAgo(row.original.createdAtUtc) },
      ...(tab === 'Submitted'
        ? []
        : ([
            { id: 'reviewer', header: 'Reviewed by', accessorFn: (r) => lookups.userName(r.reviewedById, '—') },
            { accessorKey: 'status', header: 'Outcome', cell: ({ row }) => <RequestStatusBadge status={row.original.status} /> },
          ] satisfies ColumnDef<MaintenanceRequest, unknown>[])),
    ],
    [lookups, tab],
  )

  return (
    <>
      <PageHeader title="Maintenance requests" description="Breakdowns and problems reported from the shop floor. Approving creates a work order." />
      <Card>
        <Tabs value={tab} onValueChange={(v) => setParam('tab', v === 'Submitted' ? null : v)}>
          <TabsList className="px-3">
            {REQUEST_STATUSES.map((s) => (
              <TabsTrigger key={s} value={s}>
                {TAB_LABEL[s]}
                {requests.data && <Badge tone={s === 'Submitted' && counts.Submitted > 0 ? 'info' : 'neutral'}>{counts[s]}</Badge>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <FilterBar>
          <SearchInput value={search} onChange={(v) => setParam('q', v)} placeholder="Search request, equipment, operator…" className="sm:w-72" />
          <FilterSelect label="Severity" value={severity} onChange={(v) => setParam('severity', v)} options={PRIORITIES.map((p) => ({ value: p, label: p }))} />
        </FilterBar>
        <DataTable
          key={tab}
          data={ready ? rows : undefined}
          columns={columns}
          getRowId={(r) => r.id}
          loading={requests.isPending}
          error={requests.error ?? error}
          onRetry={() => void requests.refetch()}
          onRowClick={(r) => setParam('id', r.id)}
          rowClassName={(r) => cn(r.status === 'Submitted' && r.severity === 'Critical' && 'bg-danger-soft/30')}
          emptyTitle={tab === 'Submitted' ? 'No requests waiting' : 'Nothing here yet'}
          emptyDescription={tab === 'Submitted' ? 'New reports from operators appear here.' : undefined}
          pageSize={20}
        />
      </Card>
      <RequestReviewDialog requestId={openId} onOpenChange={(o) => !o && setParam('id', null)} />
    </>
  )
}
