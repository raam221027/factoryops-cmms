import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/toggles'
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { EmptyState, ErrorState, ListSkeleton } from './states'

export type { ColumnDef } from '@tanstack/react-table'

/**
 * Sortable, paginated table. Filtering happens before data reaches the table, so the same
 * filtered list can feed counts and exports.
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  loading,
  error,
  onRetry,
  emptyTitle = 'No records found',
  emptyDescription,
  onRowClick,
  pageSize = 15,
  initialSorting = [],
  selectable = false,
  rowSelection,
  onRowSelectionChange,
  rowClassName,
}: {
  data: T[] | undefined
  columns: ColumnDef<T, unknown>[]
  getRowId: (row: T) => string
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  emptyTitle?: string
  emptyDescription?: string
  onRowClick?: (row: T) => void
  pageSize?: number
  initialSorting?: SortingState
  selectable?: boolean
  rowSelection?: RowSelectionState
  onRowSelectionChange?: (next: RowSelectionState) => void
  rowClassName?: (row: T) => string | undefined
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize })

  const selectColumn: ColumnDef<T, unknown> = {
    id: '_select',
    enableSorting: false,
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all on this page"
        checked={table.getIsAllPageRowsSelected() ? true : table.getIsSomePageRowsSelected() ? 'indeterminate' : false}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
      />
    ),
    cell: ({ row }) => (
      <Checkbox aria-label="Select row" checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} onClick={(e) => e.stopPropagation()} />
    ),
  }

  const table = useReactTable({
    data: data ?? [],
    columns: selectable ? [selectColumn, ...columns] : columns,
    getRowId,
    state: { sorting, pagination, rowSelection: rowSelection ?? {} },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection ?? {}) : updater
      onRowSelectionChange?.(next)
    },
    enableRowSelection: selectable,
    autoResetPageIndex: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  })

  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (loading || !data) return <ListSkeleton rows={6} className="p-3" />
  if (data.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />

  const { pageIndex } = table.getState().pagination
  const total = data.length
  const from = pageIndex * pagination.pageSize + 1
  const to = Math.min(total, from + pagination.pageSize - 1)

  return (
    <div>
      <Table>
        <THead>
          {table.getHeaderGroups().map((hg) => (
            <Tr key={hg.id}>
              {hg.headers.map((header) => {
                const sortable = header.column.getCanSort()
                const dir = header.column.getIsSorted()
                const content = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())
                return (
                  <Th key={header.id} aria-sort={dir ? (dir === 'asc' ? 'ascending' : 'descending') : undefined} className={header.id === '_select' ? 'w-10' : undefined}>
                    {sortable ? (
                      <button type="button" className="-ml-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground" onClick={header.column.getToggleSortingHandler()}>
                        {content}
                        {dir === 'asc' ? <ArrowUp className="size-3" /> : dir === 'desc' ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-50" />}
                      </button>
                    ) : (
                      content
                    )}
                  </Th>
                )
              })}
            </Tr>
          ))}
        </THead>
        <TBody>
          {table.getRowModel().rows.map((row) => (
            <Tr
              key={row.id}
              data-selected={row.getIsSelected() || undefined}
              className={cn(onRowClick && 'cursor-pointer hover:bg-accent/60', rowClassName?.(row.original))}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <Td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Td>
              ))}
            </Tr>
          ))}
        </TBody>
      </Table>
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>
          {from}–{to} of {total}
        </span>
        {table.getPageCount() > 1 && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="px-2">
              Page {pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button variant="outline" size="icon-sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Two-line cell: primary text with muted secondary line. */
export function CellStack({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{primary}</div>
      {secondary && <div className="truncate text-xs text-muted-foreground">{secondary}</div>}
    </div>
  )
}
