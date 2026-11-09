import { zodResolver } from '@hookform/resolvers/zod'
import { FlaskConical, KeyRound } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { Logo } from '@/components/layout/Logo'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import type { Role } from '@/domain/enums'
import { ROLE_HOME } from '@/domain/permissions'
import type { SessionUser } from '@/domain/types'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/services'
import { FullPageSpinner } from './RequireRole'
import { useAuth } from './context'
import { DemoAccountPicker } from './DemoAccountPicker'
import { PinPad } from './PinPad'

const ROLE_PREFIX: Record<Role, string> = { Admin: '/admin', Supervisor: '/supervisor', Technician: '/tech', Operator: '/operator' }

/** Where to go after sign-in: back to the page that required login if this role may see it. */
function destinationFor(user: SessionUser, from: unknown): string {
  if (typeof from === 'string' && (from.startsWith(ROLE_PREFIX[user.role]) || from.startsWith('/equipment/'))) return from
  return ROLE_HOME[user.role]
}

const schema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})
type FormValues = z.infer<typeof schema>

function PasswordForm({ onSignedIn }: { onSignedIn: (u: SessionUser) => void }) {
  const { signIn } = useAuth()
  const [error, setError] = useState<string>()
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })
  const { errors, isSubmitting } = form.formState

  const submit = form.handleSubmit(async (values) => {
    setError(undefined)
    try {
      onSignedIn(await signIn(values.email, values.password))
    } catch (e) {
      setError(errorMessage(e))
    }
  })

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input id="email" type="email" autoComplete="username" aria-invalid={!!errors.email} {...form.register('email')} />
        {errors.email && <p className="text-xs text-danger">{errors.email.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register('password')} />
        {errors.password && <p className="text-xs text-danger">{errors.password.message}</p>}
      </div>
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
        Sign in
      </Button>
    </form>
  )
}

type Mode = 'demo' | 'pin' | 'password'

export function LoginPage() {
  const { user, initializing, demo, signInAs, signInWithPin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const switching = params.get('switch') === '1'
  const [mode, setMode] = useState<Mode>(demo ? 'demo' : 'password')
  const [pinError, setPinError] = useState<string>()
  const [pinBusy, setPinBusy] = useState(false)
  const from = (location.state as { from?: string } | null)?.from

  if (initializing) return <FullPageSpinner />
  if (user && !switching) return <Navigate to={destinationFor(user, from)} replace />

  const onSignedIn = (u: SessionUser) => navigate(destinationFor(u, from), { replace: true })

  const modes: { id: Mode; label: string }[] = demo
    ? [
        { id: 'demo', label: 'Demo accounts' },
        { id: 'pin', label: 'Operator kiosk' },
        { id: 'password', label: 'Email sign-in' },
      ]
    : []

  return (
    <div className="flex min-h-dvh flex-col bg-background lg:flex-row">
      <aside className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex lg:w-[420px]">
        <Logo inverted />
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-white">Maintenance operations for the whole plant.</h1>
          <p className="mt-3 text-sm leading-relaxed">
            Breakdown reporting on the floor, work execution on the technician's phone, planning and analytics at the desk. One system, one source of truth.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/60">FactoryOps CMMS</p>
      </aside>

      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12">
        <div className={cn('w-full', mode === 'demo' ? 'max-w-2xl' : 'max-w-sm')}>
          <Logo className="mb-6 lg:hidden" />
          <h2 className="text-xl font-semibold tracking-tight">{switching ? 'Switch account' : 'Sign in'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === 'pin' ? 'Enter your 4-digit operator PIN.' : mode === 'demo' ? 'Choose an account to preview its experience.' : 'Use your FactoryOps account.'}
          </p>

          {demo && (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
              <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <strong className="font-semibold">Development demo.</strong> Demo sign-in and sample data are stored only in this browser. They are disabled in production builds and do not bypass
                server-side authorization.
              </span>
            </div>
          )}

          {modes.length > 0 && (
            <div role="tablist" aria-label="Sign-in method" className="mt-5 inline-flex rounded-md border bg-muted p-0.5">
              {modes.map((m) => (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={mode === m.id}
                  onClick={() => setMode(m.id)}
                  className={cn('rounded px-3 py-1.5 text-sm font-medium text-muted-foreground', mode === m.id && 'bg-surface text-foreground shadow-card')}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          <div className="mt-5">
            {mode === 'demo' && demo && <DemoAccountPicker demo={demo} onSelect={(id) => signInAs(id).then(onSignedIn)} />}
            {mode === 'pin' && (
              <div className="rounded-lg border bg-surface p-6">
                <div className="mb-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <KeyRound className="size-4" aria-hidden /> Demo PINs: 1111, 2222, 3333, 4444
                </div>
                <PinPad
                  busy={pinBusy}
                  error={pinError}
                  onSubmit={async (pin) => {
                    setPinBusy(true)
                    setPinError(undefined)
                    try {
                      onSignedIn(await signInWithPin(pin))
                    } catch (e) {
                      setPinError(errorMessage(e))
                    } finally {
                      setPinBusy(false)
                    }
                  }}
                />
              </div>
            )}
            {mode === 'password' && (
              <div className="rounded-lg border bg-surface p-6">
                <PasswordForm onSignedIn={onSignedIn} />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
