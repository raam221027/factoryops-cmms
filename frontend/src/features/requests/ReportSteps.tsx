import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Camera,
  CircleHelp,
  Cog,
  Droplets,
  PowerOff,
  QrCode,
  Radar,
  Thermometer,
  Volume2,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { EquipmentStatusBadge } from '@/components/shared/badges'
import { SearchInput } from '@/components/shared/filters'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Label, Textarea } from '@/components/ui/input'
import { PROBLEM_CATEGORIES, PROBLEM_CATEGORY_LABELS, WORK_ORDER_STATUS_LABELS, type Priority, type ProblemCategory, type WorkOrderStatus } from '@/domain/enums'
import { REPORT_MAX_PHOTOS as MAX_PHOTOS, REPORT_MIN_DESCRIPTION as MIN_DESCRIPTION, SEVERITY_CHOICES } from '@/domain/requests'
import type { Equipment } from '@/domain/types'
import { useSessionUser } from '@/features/auth/context'
import { EquipmentScanner } from '@/features/equipment/EquipmentScanner'
import { useEquipmentList, useLookups } from '@/features/shared/queries'
import { useRequests } from '@/features/work-orders/hooks'
import { formatAgo } from '@/lib/format'
import { safeAttachmentUrl } from '@/lib/url'
import { cn, matchesQuery } from '@/lib/utils'
import { errorMessage, services } from '@/services'

export interface Photo {
  fileName: string
  url: string
}

const CATEGORY_ICON: Record<ProblemCategory, LucideIcon> = {
  MachineNotStarting: PowerOff,
  MechanicalFailure: Cog,
  ElectricalProblem: Zap,
  AbnormalNoise: Volume2,
  Overheating: Thermometer,
  Leakage: Droplets,
  SensorMalfunction: Radar,
  Other: CircleHelp,
}

function MachineRow({ e, selected, onSelect, location }: { e: Equipment; selected: boolean; onSelect: () => void; location: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn('flex min-h-16 w-full items-center gap-3 rounded-lg border bg-surface px-3 py-2 text-left shadow-card', selected ? 'border-primary ring-2 ring-primary/30' : 'active:bg-accent')}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{e.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{e.assetId}</span> · {location}
        </p>
      </div>
      <EquipmentStatusBadge status={e.status} />
    </button>
  )
}

export function MachineStep({ equipmentId, onSelect, startScanning = false }: { equipmentId: string; onSelect: (id: string) => void; startScanning?: boolean }) {
  const user = useSessionUser()
  const equipment = useEquipmentList()
  const { lookups, ready, error } = useLookups()
  const mine = useRequests({ mine: true })
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(startScanning)
  const departmentId = lookups.users.get(user.id)?.departmentId

  const { area, recent, results } = useMemo(() => {
    const active = (equipment.data ?? []).filter((e) => e.status !== 'Retired').sort((a, b) => a.assetId.localeCompare(b.assetId))
    const byId = new Map(active.map((e) => [e.id, e]))
    const recentIds = [...new Set((mine.data ?? []).map((r) => r.equipmentId))].slice(0, 3)
    return {
      area: departmentId ? active.filter((e) => e.departmentId === departmentId) : [],
      recent: recentIds.map((id) => byId.get(id)).filter((e): e is Equipment => !!e),
      results: search ? active.filter((e) => matchesQuery(search, e.name, e.assetId, e.model, lookups.locationLabel(e.id))) : [],
    }
  }, [equipment.data, mine.data, departmentId, search, lookups])

  const selected = lookups.equipment.get(equipmentId)
  const row = (e: Equipment) => <MachineRow key={e.id} e={e} selected={e.id === equipmentId} onSelect={() => onSelect(e.id)} location={lookups.locationLabel(e.id)} />

  if (equipment.error || error) return <ErrorState error={equipment.error ?? error} onRetry={() => void equipment.refetch()} />
  if (!equipment.data || !ready) return <ListSkeleton rows={4} />

  if (selected && !scanning) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Machine</p>
        <div className="rounded-lg border-2 border-primary bg-surface p-4 shadow-card">
          <p className="text-lg font-semibold">{selected.name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{selected.assetId}</span> · {lookups.locationLabel(selected.id)}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <EquipmentStatusBadge status={selected.status} />
            <Button variant="link" className="h-auto px-0" onClick={() => onSelect('')}>
              Change machine
            </Button>
          </div>
        </div>
        <ActiveIssues equipmentId={selected.id} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {scanning ? (
        <div className="space-y-2">
          <EquipmentScanner
            onFound={(e) => {
              setScanning(false)
              onSelect(e.id)
            }}
          />
          <Button variant="outline" size="lg" className="w-full" onClick={() => setScanning(false)}>
            Choose from a list instead
          </Button>
        </div>
      ) : (
        <>
          <Button size="touch" className="w-full" onClick={() => setScanning(true)}>
            <QrCode /> Scan the machine's QR label
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or find it <span className="h-px flex-1 bg-border" />
          </div>
          <SearchInput value={search} onChange={setSearch} placeholder="Machine name or asset ID" className="[&_input]:h-12 [&_input]:text-base" />
          <div role="radiogroup" aria-label="Machine" className="space-y-4">
            {search ? (
              results.length ? (
                <ul className="space-y-2">{results.map((e) => <li key={e.id}>{row(e)}</li>)}</ul>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No machine matches "{search}".</p>
              )
            ) : (
              <>
                {recent.length > 0 && (
                  <section aria-label="Recently reported">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">You reported recently</h3>
                    <ul className="space-y-2">{recent.map((e) => <li key={e.id}>{row(e)}</li>)}</ul>
                  </section>
                )}
                {area.length > 0 && (
                  <section aria-label="My area">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      My area · {lookups.departments.get(departmentId!)?.name}
                    </h3>
                    <ul className="space-y-2">{area.map((e) => <li key={e.id}>{row(e)}</li>)}</ul>
                  </section>
                )}
                {!area.length && !recent.length && <p className="py-4 text-center text-sm text-muted-foreground">Search for the machine by name or asset ID.</p>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** Tells the reporter the problem may already be known, so they can avoid a duplicate. */
function ActiveIssues({ equipmentId }: { equipmentId: string }) {
  const issues = useQuery({ queryKey: ['requests', 'active', equipmentId], queryFn: () => services.requests.activeIssues(equipmentId) })
  if (!issues.data?.length) return null
  return (
    <div className="rounded-lg border border-warning/40 bg-warning-soft/50 p-3" role="status">
      <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
        <AlertTriangle className="size-4" aria-hidden /> Already reported on this machine
      </p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {issues.data.map((i) => (
          <li key={i.number}>
            <span className="font-medium">{i.summary}</span>
            <span className="block text-xs text-muted-foreground">
              {i.number} · {i.kind === 'request' ? 'awaiting review' : WORK_ORDER_STATUS_LABELS[i.status as WorkOrderStatus].toLowerCase()} · {formatAgo(i.sinceUtc)}
              {i.reportedByMe && ' · by you'}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">If it's the same problem, there's no need to report it again. Continue if this is something new.</p>
    </div>
  )
}

export function ProblemStep({
  category,
  severity,
  onCategory,
  onSeverity,
}: {
  category: ProblemCategory | ''
  severity: Priority | ''
  onCategory: (c: ProblemCategory) => void
  onSeverity: (s: Priority) => void
}) {
  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">What's the problem?</legend>
        <div role="radiogroup" aria-label="Problem" className="grid grid-cols-2 gap-2">
          {PROBLEM_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c]
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={category === c}
                onClick={() => onCategory(c)}
                className={cn(
                  'flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border bg-surface p-2 text-center text-sm font-medium shadow-card',
                  category === c ? 'border-primary bg-primary-soft text-primary ring-2 ring-primary/30' : 'active:bg-accent',
                )}
              >
                <Icon className="size-6" aria-hidden />
                {PROBLEM_CATEGORY_LABELS[c]}
              </button>
            )
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">How bad is it?</legend>
        <div role="radiogroup" aria-label="Severity" className="space-y-2">
          {SEVERITY_CHOICES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={severity === s.value}
              onClick={() => onSeverity(s.value)}
              className={cn(
                'flex min-h-14 w-full items-center gap-3 rounded-lg border bg-surface px-3 py-2 text-left shadow-card',
                severity === s.value ? (s.value === 'Critical' ? 'border-danger bg-danger-soft ring-2 ring-danger/30' : 'border-primary bg-primary-soft ring-2 ring-primary/30') : 'active:bg-accent',
              )}
            >
              <span className={cn('size-3 shrink-0 rounded-full', { Critical: 'bg-danger', High: 'bg-warning', Medium: 'bg-info', Low: 'bg-neutral' }[s.value])} aria-hidden />
              <span>
                <span className="block text-sm font-medium">{s.title}</span>
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
            </button>
          ))}
        </div>
        {severity === 'Critical' && <p className="mt-2 text-xs text-danger">The machine will be marked out of service and the supervisor alerted straight away.</p>}
      </fieldset>
    </div>
  )
}

export function DetailsStep({
  description,
  additionalInfo,
  photos,
  onDescription,
  onAdditionalInfo,
  onPhotos,
  showErrors,
}: {
  description: string
  additionalInfo: string
  photos: Photo[]
  onDescription: (v: string) => void
  onAdditionalInfo: (v: string) => void
  onPhotos: (p: Photo[]) => void
  showErrors: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const short = description.trim().length < MIN_DESCRIPTION

  async function add(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      onPhotos([...photos, await services.attachments.upload(file)])
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setUploading(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="rq-description">
          What did you see, hear or smell? <span className="text-danger">*</span>
        </Label>
        <Textarea
          id="rq-description"
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          className="min-h-28 text-base"
          placeholder="e.g. Loud grinding noise from the gearbox since the start of the shift, getting worse."
          aria-invalid={showErrors && short}
          aria-describedby="rq-description-hint"
        />
        <p id="rq-description-hint" className={cn('text-xs', showErrors && short ? 'text-danger' : 'text-muted-foreground')}>
          {showErrors && short ? 'Please describe the problem in a few words.' : 'A few words is enough.'}
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">
          Photos <span className="font-normal text-muted-foreground">(optional, up to {MAX_PHOTOS})</span>
        </p>
        <ul className="grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <li key={p.url.slice(-24) + i} className="relative">
              <img src={safeAttachmentUrl(p.url)} alt={`Photo ${i + 1}`} className="aspect-square w-full rounded-md border object-cover" />
              <button
                type="button"
                onClick={() => onPhotos(photos.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 flex size-8 items-center justify-center rounded-full border bg-surface shadow-card"
                aria-label={`Remove photo ${i + 1}`}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
          {photos.length < MAX_PHOTOS && (
            <li>
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={uploading}
                className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-sm text-muted-foreground active:bg-accent disabled:opacity-60"
              >
                <Camera className={cn('size-6', uploading && 'animate-pulse')} aria-hidden />
                {uploading ? 'Adding…' : 'Add photo'}
              </button>
            </li>
          )}
        </ul>
        <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void add(e.target.files?.[0])} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rq-info">
          Anything else? <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea id="rq-info" value={additionalInfo} onChange={(e) => onAdditionalInfo(e.target.value)} className="min-h-16" placeholder="When it started, what you already tried, part numbers…" />
      </div>
    </div>
  )
}
