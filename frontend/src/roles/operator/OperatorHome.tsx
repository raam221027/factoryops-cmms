import { ChevronRight, Megaphone, QrCode } from 'lucide-react'
import { Link } from 'react-router'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { requestStage } from '@/domain/requests'
import { useSessionUser } from '@/features/auth/context'
import { useLookups } from '@/features/shared/queries'
import { useRequests } from '@/features/work-orders/hooks'
import { RequestCard } from './RequestCard'

const PREVIEW = 3

export function OperatorHome() {
  const user = useSessionUser()
  const requests = useRequests({ mine: true })
  const { lookups, ready } = useLookups()
  const open = (requests.data ?? []).filter((r) => requestStage(r).open).sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Hello, {user.name.split(' ')[0]}</h1>
        <p className="text-sm text-muted-foreground">Something wrong with a machine? Report it here.</p>
      </div>

      <Link to="/operator/report" className="flex items-center gap-4 rounded-xl bg-primary p-5 text-primary-foreground shadow-popover active:opacity-95">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-white/15">
          <Megaphone className="size-7" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-semibold">Report a problem</span>
          <span className="block text-sm opacity-85">Takes less than a minute</span>
        </span>
        <ChevronRight className="size-6 shrink-0" aria-hidden />
      </Link>

      <Link to="/operator/report?scan=1" className="flex items-center gap-3 rounded-lg border bg-surface p-4 shadow-card active:bg-accent">
        <QrCode className="size-6 text-primary" aria-hidden />
        <span className="flex-1 text-sm font-medium">Scan the machine's QR label</span>
        <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
      </Link>

      <section aria-labelledby="open-requests">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="open-requests" className="text-sm font-semibold">
            My open reports {requests.data && <span className="font-normal text-muted-foreground">({open.length})</span>}
          </h2>
          <Link to="/operator/requests" className="flex items-center text-xs text-primary">
            All reports <ChevronRight className="size-3.5" />
          </Link>
        </div>
        {requests.error ? (
          <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
        ) : !requests.data || !ready ? (
          <ListSkeleton rows={2} />
        ) : open.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">Nothing open. Problems you report are tracked here until they're fixed.</p>
        ) : (
          <ul className="space-y-2">
            {open.slice(0, PREVIEW).map((r) => (
              <li key={r.id}>
                <RequestCard r={r} lookups={lookups} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
