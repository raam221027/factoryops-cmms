import { Download, Plus, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { EquipmentStatusBadge } from '@/components/shared/badges'
import { CellStack, DataTable, type ColumnDef } from '@/components/shared/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filters'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EQUIPMENT_STATUS_LABELS, EQUIPMENT_STATUSES, type EquipmentStatus } from '@/domain/enums'
import type { Equipment } from '@/domain/types'
import { useEquipmentList, useLookups } from '@/features/shared/queries'
import { downloadCsv } from '@/lib/csv'
import { matchesQuery } from '@/lib/utils'

export function EquipmentListPage() {
  const navigate = useNavigate()
  const equipment = useEquipmentList()
  const { lookups, ready, error } = useLookups()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<EquipmentStatus | ''>('')
  const [categoryId, setCategoryId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [selection, setSelection] = useState<Record<string, boolean>>({})

  const rows = useMemo(
    () =>
      (equipment.data ?? []).filter(
        (e) =>
          (!status || e.status === status) &&
          (!categoryId || e.categoryId === categoryId) &&
          (!departmentId || e.departmentId === departmentId) &&
          matchesQuery(search, e.name, e.assetId, e.serialNumber, e.manufacturer, e.model),
      ),
    [equipment.data, status, categoryId, departmentId, search],
  )

  const columns = useMemo<ColumnDef<Equipment, unknown>[]>(
    () => [
      { accessorKey: 'assetId', header: 'Asset ID', cell: ({ row }) => <span className="font-mono text-xs">{row.original.assetId}</span> },
      {
        accessorKey: 'name',
        header: 'Equipment',
        cell: ({ row }) => <CellStack primary={row.original.name} secondary={[row.original.manufacturer, row.original.model].filter(Boolean).join(' ') || undefined} />,
      },
      { id: 'category', header: 'Category', accessorFn: (e) => lookups.categories.get(e.categoryId)?.name ?? '' },
      {
        id: 'location',
        header: 'Location',
        accessorFn: (e) => lookups.locationLabel(e.id),
        cell: ({ row }) => <CellStack primary={lookups.locationLabel(row.original.id)} secondary={lookups.departments.get(row.original.departmentId)?.name} />,
      },
      {
        accessorKey: 'criticality',
        header: 'Criticality',
        sortingFn: (a, b) => ['Low', 'Medium', 'High'].indexOf(a.original.criticality) - ['Low', 'Medium', 'High'].indexOf(b.original.criticality),
        cell: ({ row }) => <Badge tone={row.original.criticality === 'High' ? 'warning' : 'neutral'}>{row.original.criticality}</Badge>,
      },
      { accessorKey: 'status', header: 'Status', cell: ({ row }) => <EquipmentStatusBadge status={row.original.status} /> },
    ],
    [lookups],
  )

  const selectedIds = Object.keys(selection).filter((id) => selection[id])

  function exportCsv() {
    downloadCsv('equipment', rows, [
      { header: 'Asset ID', value: (e) => e.assetId },
      { header: 'Name', value: (e) => e.name },
      { header: 'Serial number', value: (e) => e.serialNumber },
      { header: 'Manufacturer', value: (e) => e.manufacturer },
      { header: 'Model', value: (e) => e.model },
      { header: 'Category', value: (e) => lookups.categories.get(e.categoryId)?.name },
      { header: 'Department', value: (e) => lookups.departments.get(e.departmentId)?.name },
      { header: 'Location', value: (e) => lookups.locations.get(e.locationId)?.name },
      { header: 'Criticality', value: (e) => e.criticality },
      { header: 'Status', value: (e) => EQUIPMENT_STATUS_LABELS[e.status] },
      { header: 'Installed', value: (e) => e.installationDate },
      { header: 'Warranty until', value: (e) => e.warrantyExpiry },
    ])
  }

  return (
    <>
      <PageHeader
        title="Equipment"
        description="Asset register, QR labels and maintenance history."
        actions={
          <Button asChild>
            <Link to="/admin/equipment/new">
              <Plus /> Add equipment
            </Link>
          </Button>
        }
      />
      <Card>
        <FilterBar
          actions={
            <>
              <Button variant="outline" size="sm" disabled={!selectedIds.length} onClick={() => navigate(`/admin/equipment/labels?ids=${selectedIds.join(',')}`)}>
                <Printer /> QR labels{selectedIds.length ? ` (${selectedIds.length})` : ''}
              </Button>
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
                <Download /> Export
              </Button>
            </>
          }
        >
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, asset ID, serial…" className="sm:w-72" />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={EQUIPMENT_STATUSES.map((s) => ({ value: s, label: EQUIPMENT_STATUS_LABELS[s] }))} />
          <FilterSelect label="Category" value={categoryId} onChange={setCategoryId} options={[...lookups.categories.values()].map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect label="Department" value={departmentId} onChange={setDepartmentId} options={[...lookups.departments.values()].map((d) => ({ value: d.id, label: d.name }))} />
        </FilterBar>
        <DataTable
          data={ready ? rows : undefined}
          columns={columns}
          getRowId={(e) => e.id}
          loading={equipment.isPending}
          error={equipment.error ?? error}
          onRetry={() => void equipment.refetch()}
          onRowClick={(e) => navigate(`/admin/equipment/${e.id}`)}
          selectable
          rowSelection={selection}
          onRowSelectionChange={setSelection}
          emptyTitle="No equipment matches your filters"
          initialSorting={[{ id: 'assetId', desc: false }]}
        />
      </Card>
    </>
  )
}
