import { ArrowLeft, Printer } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { QrCode } from '@/components/shared/QrCode'
import { EmptyState, ErrorState, ListSkeleton } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { useLookups } from '@/features/shared/queries'
import { equipmentQrUrl } from '@/lib/dateRange'

/**
 * Print sheet of equipment QR labels. Rendered without the app shell so it prints cleanly
 * (A4/Letter, 3 labels per row).
 */
export function QrLabelsPage() {
  const [params] = useSearchParams()
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean)
  const { lookups, ready, error } = useLookups()
  const items = ids.map((id) => lookups.equipment.get(id)).filter((e) => !!e)

  return (
    <div className="min-h-dvh bg-background print:bg-white">
      <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-4 print:hidden">
        <Button variant="ghost" asChild>
          <Link to="/admin/equipment">
            <ArrowLeft /> Back to equipment
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          {items.length} label{items.length === 1 ? '' : 's'}
        </p>
        <Button className="ml-auto" onClick={() => window.print()} disabled={!items.length}>
          <Printer /> Print
        </Button>
      </div>
      <main className="mx-auto max-w-4xl px-4 pb-10 print:max-w-none print:p-0">
        {error ? (
          <ErrorState error={error} />
        ) : !ready ? (
          <ListSkeleton rows={3} />
        ) : items.length === 0 ? (
          <EmptyState title="No equipment selected" description="Select equipment in the list, then choose QR labels." />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3 print:gap-2">
            {items.map((e) => (
              <li key={e.id} className="flex break-inside-avoid flex-col items-center rounded-md border border-dashed bg-white p-3 text-center text-black">
                <QrCode value={equipmentQrUrl(e.assetId)} size={132} label={`QR code for ${e.assetId}`} />
                <p className="mt-1 font-mono text-base font-bold">{e.assetId}</p>
                <p className="line-clamp-2 text-xs">{e.name}</p>
                <p className="mt-0.5 text-[10px] text-neutral-500">{lookups.locationLabel(e.id)} · Scan to report a problem</p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
