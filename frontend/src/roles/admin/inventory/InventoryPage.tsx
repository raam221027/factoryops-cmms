import { useQuery } from '@tanstack/react-query'
import { ArrowDownUp, Boxes, DollarSign, Download, History, PackageX, Pencil, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { CellStack, DataTable, type ColumnDef } from '@/components/shared/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filters'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/toggles'
import { lowStockParts } from '@/domain/metrics'
import type { InventoryTransaction, SparePart } from '@/domain/types'
import { useLookups, useParts } from '@/features/shared/queries'
import { downloadCsv } from '@/lib/csv'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { matchesQuery, sum } from '@/lib/utils'
import { services } from '@/services'
import { PartDialog, StockDialog } from './InventoryDialogs'

export function InventoryPage() {
  const parts = useParts()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [editing, setEditing] = useState<{ open: boolean; part?: SparePart }>({ open: false })
  const [adjusting, setAdjusting] = useState<SparePart | null>(null)

  const all = useMemo(() => parts.data ?? [], [parts.data])
  const categories = useMemo(() => [...new Set(all.map((p) => p.category))].sort(), [all])
  const low = useMemo(() => new Set(lowStockParts(all).map((p) => p.id)), [all])
  const rows = useMemo(
    () => all.filter((p) => (!category || p.category === category) && (!lowOnly || low.has(p.id)) && matchesQuery(search, p.partNumber, p.name, p.storageLocation)),
    [all, category, lowOnly, low, search],
  )

  const columns = useMemo<ColumnDef<SparePart, unknown>[]>(
    () => [
      { accessorKey: 'partNumber', header: 'Part no.', cell: ({ row }) => <span className="font-mono text-xs">{row.original.partNumber}</span> },
      { accessorKey: 'name', header: 'Part', cell: ({ row }) => <CellStack primary={row.original.name} secondary={row.original.category} /> },
      { accessorKey: 'storageLocation', header: 'Location' },
      {
        accessorKey: 'quantityOnHand',
        header: 'On hand',
        cell: ({ row }) => (
          <span className="flex items-center gap-2 tabular-nums">
            <span className={low.has(row.original.id) ? 'font-semibold text-danger' : undefined}>
              {row.original.quantityOnHand} {row.original.unit}
            </span>
            {low.has(row.original.id) && <Badge tone="danger">Low</Badge>}
          </span>
        ),
      },
      { accessorKey: 'minimumStock', header: 'Min', cell: ({ row }) => <span className="tabular-nums">{row.original.minimumStock}</span> },
      { accessorKey: 'unitCost', header: 'Unit cost', cell: ({ row }) => <span className="tabular-nums">{formatCurrency(row.original.unitCost)}</span> },
      { id: 'value', header: 'Stock value', accessorFn: (p) => p.unitCost * p.quantityOnHand, cell: ({ getValue }) => <span className="tabular-nums">{formatCurrency(getValue() as number)}</span> },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm" onClick={() => setAdjusting(row.original)}>
              <ArrowDownUp /> Stock
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => setEditing({ open: true, part: row.original })} aria-label={`Edit ${row.original.name}`}>
              <Pencil />
            </Button>
          </div>
        ),
      },
    ],
    [low],
  )

  return (
    <>
      <PageHeader
        title="Spare parts inventory"
        description="Stock levels, reorder points and stock movements."
        actions={
          <Button onClick={() => setEditing({ open: true })}>
            <Plus /> Add part
          </Button>
        }
      />
      <section aria-label="Inventory summary" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Parts tracked" value={parts.data ? all.length : '–'} icon={Boxes} />
        <KpiCard label="Low stock" value={parts.data ? low.size : '–'} icon={PackageX} tone={low.size ? 'danger' : 'success'} hint="At or below minimum" />
        <KpiCard label="Stock value" value={parts.data ? formatCurrency(sum(all.map((p) => p.unitCost * p.quantityOnHand))) : '–'} icon={DollarSign} tone="info" />
        <KpiCard label="Categories" value={parts.data ? categories.length : '–'} />
      </section>

      <Tabs defaultValue="parts">
        <TabsList>
          <TabsTrigger value="parts">
            <Boxes /> Parts
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> Stock movements
          </TabsTrigger>
        </TabsList>
        <TabsContent value="parts">
          <Card>
            <FilterBar
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!rows.length}
                  onClick={() =>
                    downloadCsv('spare-parts', rows, [
                      { header: 'Part number', value: (p) => p.partNumber },
                      { header: 'Name', value: (p) => p.name },
                      { header: 'Category', value: (p) => p.category },
                      { header: 'Location', value: (p) => p.storageLocation },
                      { header: 'On hand', value: (p) => p.quantityOnHand },
                      { header: 'Unit', value: (p) => p.unit },
                      { header: 'Minimum', value: (p) => p.minimumStock },
                      { header: 'Unit cost', value: (p) => p.unitCost },
                      { header: 'Low stock', value: (p) => (low.has(p.id) ? 'yes' : 'no') },
                    ])
                  }
                >
                  <Download /> Export
                </Button>
              }
            >
              <SearchInput value={search} onChange={setSearch} placeholder="Search part number, name…" className="sm:w-72" />
              <FilterSelect label="Category" value={category} onChange={setCategory} options={categories.map((c) => ({ value: c, label: c }))} />
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={lowOnly} onCheckedChange={setLowOnly} />
                Low stock only
              </label>
            </FilterBar>
            <DataTable
              data={parts.data ? rows : undefined}
              columns={columns}
              getRowId={(p) => p.id}
              loading={parts.isPending}
              error={parts.error}
              onRetry={() => void parts.refetch()}
              rowClassName={(p) => (low.has(p.id) ? 'bg-danger-soft/40' : undefined)}
              initialSorting={[{ id: 'partNumber', desc: false }]}
              emptyTitle={lowOnly ? 'No parts are low on stock' : 'No parts match'}
            />
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <TransactionsTable parts={all} />
        </TabsContent>
      </Tabs>

      <PartDialog open={editing.open} part={editing.part} categories={categories} onOpenChange={(open) => setEditing((s) => ({ ...s, open }))} />
      <StockDialog part={adjusting} onOpenChange={(o) => !o && setAdjusting(null)} />
    </>
  )
}

const TYPE_TONE = { Receipt: 'success', Issue: 'warning', Adjustment: 'neutral' } as const

function TransactionsTable({ parts }: { parts: SparePart[] }) {
  const transactions = useQuery({ queryKey: ['inventory', 'transactions'], queryFn: () => services.inventory.listTransactions() })
  const { lookups } = useLookups()
  const partById = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts])

  const columns = useMemo<ColumnDef<InventoryTransaction, unknown>[]>(
    () => [
      { accessorKey: 'atUtc', header: 'Date', cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.atUtc)}</span> },
      { id: 'part', header: 'Part', accessorFn: (t) => partById.get(t.partId)?.name ?? '', cell: ({ row }) => <CellStack primary={partById.get(row.original.partId)?.name} secondary={partById.get(row.original.partId)?.partNumber} /> },
      { accessorKey: 'type', header: 'Type', cell: ({ row }) => <Badge tone={TYPE_TONE[row.original.type]}>{row.original.type}</Badge> },
      {
        accessorKey: 'quantity',
        header: 'Qty',
        cell: ({ row }) => (
          <span className={row.original.quantity > 0 ? 'tabular-nums text-success' : 'tabular-nums text-danger'}>
            {row.original.quantity > 0 ? '+' : ''}
            {row.original.quantity}
          </span>
        ),
      },
      {
        id: 'reference',
        header: 'Reference',
        accessorFn: (t) => t.note ?? '',
        cell: ({ row }) => row.original.note ?? '—',
      },
      { id: 'user', header: 'By', accessorFn: (t) => lookups.userName(t.userId, '—') },
    ],
    [partById, lookups],
  )

  return (
    <Card>
      <DataTable
        data={transactions.data}
        columns={columns}
        getRowId={(t) => t.id}
        loading={transactions.isPending}
        error={transactions.error}
        onRetry={() => void transactions.refetch()}
        initialSorting={[{ id: 'atUtc', desc: true }]}
        pageSize={20}
        emptyTitle="No stock movements yet"
      />
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        Issues against work orders are recorded automatically when technicians log parts used.{' '}
        <Link to="/admin/reports" className="underline">
          See maintenance cost report
        </Link>
      </p>
    </Card>
  )
}
