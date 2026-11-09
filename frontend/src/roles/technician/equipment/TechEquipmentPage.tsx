import { useQuery } from '@tanstack/react-query'
import { MapPin, Megaphone, Wrench } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { EquipmentStatusBadge } from '@/components/shared/badges'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { isOpen } from '@/domain/workOrderRules'
import { useDowntimes, useLookups } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { formatDate, formatHours } from '@/lib/format'
import { services } from '@/services'
import { Elapsed, JobCard, MobileHeader } from '../components'
import { Section } from '../jobs/JobSections'

/** What a technician needs at the machine: their open work on it and how it was fixed before. */
export function TechEquipmentPage() {
  const { id = '' } = useParams()
  const equipment = useQuery({ queryKey: ['equipment', 'detail', id], queryFn: () => services.equipment.get(id) })
  const history = useQuery({ queryKey: ['equipment', 'history', id], queryFn: () => services.equipment.history(id, 15) })
  const mine = useWorkOrders({ mine: true, equipmentId: id })
  const downtimes = useDowntimes()
  const { lookups } = useLookups()

  if (equipment.isPending) return <ListSkeleton rows={5} />
  if (equipment.error)
    return (
      <>
        <MobileHeader title="Equipment" back="/tech" />
        <ErrorState error={equipment.error} onRetry={() => void equipment.refetch()} />
      </>
    )
  const e = equipment.data
  const openJobs = (mine.data ?? []).filter(isOpen)
  const down = downtimes.data?.find((d) => d.equipmentId === e.id && !d.endUtc)

  return (
    <>
      <MobileHeader title={e.name} subtitle={<span className="font-mono text-xs">{e.assetId}</span>} back="/tech" />
      <div className="space-y-3">
        <div className="rounded-lg border bg-surface p-4 shadow-card">
          <div className="flex flex-wrap items-center gap-1.5">
            <EquipmentStatusBadge status={e.status} />
            {e.criticality === 'High' && <Badge tone="warning">High criticality</Badge>}
          </div>
          {down && (
            <p className="mt-2 text-sm font-medium text-danger">
              Down for <Elapsed since={down.startUtc} /> · {down.reason}
            </p>
          )}
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Location</dt>
              <dd className="flex items-center gap-1">
                <MapPin className="size-3.5 text-muted-foreground" aria-hidden /> {lookups.locationLabel(e.id)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Make / model</dt>
              <dd>{[e.manufacturer, e.model].filter(Boolean).join(' ') || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Serial</dt>
              <dd className="font-mono text-xs">{e.serialNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Category</dt>
              <dd>{lookups.categories.get(e.categoryId)?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Installed</dt>
              <dd>{formatDate(e.installationDate)}</dd>
            </div>
          </dl>
        </div>

        <section aria-label="My open jobs on this machine">
          <h2 className="mb-2 text-sm font-semibold">My open jobs here ({openJobs.length})</h2>
          {mine.isPending ? (
            <ListSkeleton rows={1} />
          ) : openJobs.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">No open jobs assigned to you on this machine.</p>
          ) : (
            <ul className="space-y-2">
              {openJobs.map((wo) => (
                <li key={wo.id}>
                  <JobCard wo={wo} lookups={lookups} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <Button variant="outline" size="lg" className="w-full" asChild>
          <Link to={`/tech/report?equipment=${e.id}`}>
            <Megaphone /> Report a new problem on this machine
          </Link>
        </Button>

        <Section title="Repair history" aside={<span className="text-xs text-muted-foreground">Last {history.data?.length ?? 0}</span>}>
          {history.isPending ? (
            <ListSkeleton rows={3} />
          ) : history.error ? (
            <ErrorState error={history.error} onRetry={() => void history.refetch()} />
          ) : history.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed work recorded yet.</p>
          ) : (
            <ol className="space-y-4">
              {history.data.map((wo) => (
                <li key={wo.id} className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Wrench className="size-3.5" aria-hidden />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className="font-medium">{wo.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(wo.completedAtUtc)} · {lookups.userName(wo.assigneeId, 'Unknown')} · {formatHours(wo.laborHours)}
                    </p>
                    {wo.rootCause && (
                      <p className="mt-1">
                        <span className="text-muted-foreground">Cause:</span> {wo.rootCause}
                      </p>
                    )}
                    {wo.actionsTaken && (
                      <p>
                        <span className="text-muted-foreground">Fix:</span> {wo.actionsTaken}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>
    </>
  )
}
