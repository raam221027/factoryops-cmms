import { CheckCircle2, ChevronLeft, LogOut } from 'lucide-react'
import { useState } from 'react'
import { Link, useBlocker, useNavigate } from 'react-router'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PriorityBadge } from '@/components/shared/badges'
import { Button } from '@/components/ui/button'
import { PROBLEM_CATEGORY_LABELS, type Priority, type ProblemCategory } from '@/domain/enums'
import { REPORT_MIN_DESCRIPTION } from '@/domain/requests'
import type { MaintenanceRequest } from '@/domain/types'
import { useAuth } from '@/features/auth/context'
import { useServiceMutation } from '@/features/shared/mutations'
import { useLookups } from '@/features/shared/queries'
import { cn } from '@/lib/utils'
import { services } from '@/services'
import { DetailsStep, MachineStep, ProblemStep, type Photo } from './ReportSteps'

const STEPS = ['Machine', 'Problem', 'Details'] as const

/**
 * Three-step breakdown report: which machine, what kind of problem and how bad, then a short
 * description and optional photos. Shared by operators and technicians.
 */
export function ReportWizard({
  home,
  initialEquipmentId = '',
  startScanning = false,
  requestPath,
}: {
  /** Where "Done" and cancelling lead */
  home: string
  initialEquipmentId?: string
  /** Open the camera straight away on the machine step */
  startScanning?: boolean
  /** Link to the submitted request, when the reporter has a requests screen */
  requestPath?: (id: string) => string
}) {
  const navigate = useNavigate()
  const { kiosk, signOut } = useAuth()
  const [step, setStep] = useState(initialEquipmentId ? 1 : 0)
  const [equipmentId, setEquipmentId] = useState(initialEquipmentId)
  const [category, setCategory] = useState<ProblemCategory | ''>('')
  const [severity, setSeverity] = useState<Priority | ''>('')
  const [description, setDescription] = useState('')
  const [additionalInfo, setAdditionalInfo] = useState('')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [showErrors, setShowErrors] = useState(false)
  const [submitted, setSubmitted] = useState<MaintenanceRequest | null>(null)

  const submit = useServiceMutation(
    () =>
      services.requests.create({
        equipmentId,
        category: category as ProblemCategory,
        severity: severity as Priority,
        description: description.trim(),
        additionalInfo: additionalInfo.trim() || undefined,
        attachments: photos.map((p) => ({ kind: 'Problem', ...p })),
      }),
    { invalidates: ['requests', 'equipment', 'downtime', 'notifications'], onSuccess: (r) => setSubmitted(r) },
  )

  const dirty = !submitted && (!!category || !!description.trim() || photos.length > 0 || (!!equipmentId && equipmentId !== initialEquipmentId))
  // Leaving mid-report would lose it. Sign-out (session end) is never blocked.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname && !nextLocation.pathname.startsWith('/login'))

  const canNext = [!!equipmentId, !!category && !!severity, description.trim().length >= REPORT_MIN_DESCRIPTION][step]

  function reset() {
    setStep(0)
    setEquipmentId('')
    setCategory('')
    setSeverity('')
    setDescription('')
    setAdditionalInfo('')
    setPhotos([])
    setShowErrors(false)
    setSubmitted(null)
  }

  if (submitted) {
    return (
      <Confirmation
        request={submitted}
        home={home}
        requestPath={requestPath}
        onAnother={reset}
        onSignOut={
          kiosk
            ? async () => {
                await signOut()
                navigate('/login?mode=pin', { replace: true })
              }
            : undefined
        }
      />
    )
  }

  return (
    <>
      <div className="mb-4 flex items-start gap-2">
        <button
          type="button"
          onClick={() => (step === 0 ? navigate(home) : setStep(step - 1))}
          className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-accent"
          aria-label={step === 0 ? 'Cancel report' : 'Previous step'}
        >
          <ChevronLeft className="size-6" />
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="text-lg font-semibold leading-tight">Report a problem</h1>
          <p className="text-sm text-muted-foreground">
            Step {step + 1} of {STEPS.length}: {STEPS[step]}
          </p>
        </div>
      </div>

      <ol className="mb-5 grid grid-cols-3 gap-1.5" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined}>
            <span className={cn('block h-1.5 rounded-full', i <= step ? 'bg-primary' : 'bg-muted')} />
            <span className={cn('mt-1 block text-xs', i === step ? 'font-medium text-foreground' : 'text-muted-foreground')}>{s}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <MachineStep equipmentId={equipmentId} onSelect={setEquipmentId} startScanning={startScanning} />
      )}
      {step === 1 && <ProblemStep category={category} severity={severity} onCategory={setCategory} onSeverity={setSeverity} />}
      {step === 2 && (
        <>
          <DetailsStep
            description={description}
            additionalInfo={additionalInfo}
            photos={photos}
            onDescription={setDescription}
            onAdditionalInfo={setAdditionalInfo}
            onPhotos={setPhotos}
            showErrors={showErrors}
          />
          <Summary equipmentId={equipmentId} category={category as ProblemCategory} severity={severity as Priority} />
        </>
      )}

      <div className="h-20" aria-hidden />
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-2 px-4 py-2.5">
          {step < STEPS.length - 1 ? (
            <Button size="touch" className="flex-1" disabled={!canNext} onClick={() => setStep(step + 1)}>
              Next: {STEPS[step + 1]}
            </Button>
          ) : (
            <Button
              size="touch"
              variant={severity === 'Critical' ? 'danger' : 'default'}
              className="flex-1"
              loading={submit.isPending}
              onClick={() => {
                setShowErrors(true)
                if (canNext) submit.mutate(undefined)
              }}
            >
              Send report
            </Button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => !o && blocker.state === 'blocked' && blocker.reset()}
        title="Discard this report?"
        description="What you've entered so far will be lost."
        confirmLabel="Discard"
        destructive
        onConfirm={() => blocker.proceed?.()}
      />
    </>
  )
}

function Summary({ equipmentId, category, severity }: { equipmentId: string; category: ProblemCategory; severity: Priority }) {
  const { lookups } = useLookups()
  const e = lookups.equipment.get(equipmentId)
  return (
    <div className="mt-5 rounded-lg bg-muted/70 p-3 text-sm">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">You're reporting</p>
      <p className="font-medium">{e ? `${e.name} (${e.assetId})` : 'Unknown machine'}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-2">
        {PROBLEM_CATEGORY_LABELS[category]} <PriorityBadge priority={severity} />
      </p>
    </div>
  )
}

function Confirmation({
  request,
  home,
  requestPath,
  onAnother,
  onSignOut,
}: {
  request: MaintenanceRequest
  home: string
  requestPath?: (id: string) => string
  onAnother: () => void
  onSignOut?: () => void
}) {
  const { lookups } = useLookups()
  const critical = request.severity === 'Critical'
  return (
    <div className="flex flex-col items-center pt-6 text-center" role="status">
      <span className="flex size-16 items-center justify-center rounded-full bg-success-soft text-success">
        <CheckCircle2 className="size-9" aria-hidden />
      </span>
      <h1 className="mt-4 text-xl font-semibold">Report sent</h1>
      <p className="mt-1 font-mono text-lg">{request.number}</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {lookups.equipmentName(request.equipmentId)} · {PROBLEM_CATEGORY_LABELS[request.category]}. The maintenance supervisor has been notified and you'll get an update when it's reviewed.
      </p>
      {critical && (
        <p className="mt-3 max-w-sm rounded-md border border-danger/40 bg-danger-soft px-3 py-2 text-sm text-danger">
          The machine is now marked out of service. If anyone is in danger, use the emergency stop and alert your team leader.
        </p>
      )}
      <div className="mt-8 grid w-full max-w-sm gap-2">
        {onSignOut && (
          <Button size="touch" onClick={onSignOut}>
            <LogOut /> Finish &amp; sign out
          </Button>
        )}
        <Button size="touch" variant={onSignOut ? 'outline' : 'default'} onClick={onAnother}>
          Report another problem
        </Button>
        {requestPath && (
          <Button size="lg" variant="outline" asChild>
            <Link to={requestPath(request.id)}>Follow this request</Link>
          </Button>
        )}
        <Button size="lg" variant="ghost" asChild>
          <Link to={home}>Back to home</Link>
        </Button>
      </div>
    </div>
  )
}
