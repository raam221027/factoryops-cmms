import { useQuery } from '@tanstack/react-query'
import { startOfMonth } from 'date-fns'
import { LogOut, Mail, Phone, Repeat } from 'lucide-react'
import { useNavigate } from 'react-router'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/misc'
import { mttrHours } from '@/domain/metrics'
import { useAuth, useSessionUser } from '@/features/auth/context'
import { useDepartments } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { formatHours } from '@/lib/format'
import { services } from '@/services'
import { MobileHeader } from '../components'
import { Section } from '../jobs/JobSections'

export function ProfilePage() {
  const session = useSessionUser()
  const { signOut, demo } = useAuth()
  const navigate = useNavigate()
  const profile = useQuery({ queryKey: ['users', 'detail', session.id], queryFn: () => services.users.get(session.id) })
  const completed = useWorkOrders({ mine: true, status: 'Completed' })
  const departments = useDepartments()

  if (profile.isPending) return <ListSkeleton rows={4} />
  if (profile.error) return <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
  const u = profile.data
  const monthStart = startOfMonth(new Date()).toISOString()
  const month = (completed.data ?? []).filter((w) => (w.completedAtUtc ?? '') >= monthStart)

  return (
    <>
      <MobileHeader title="My profile" />
      <div className="space-y-3">
        <div className="flex items-center gap-4 rounded-lg border bg-surface p-4 shadow-card">
          <Avatar name={u.name} className="size-14 text-lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{u.name}</p>
            <p className="truncate text-sm text-muted-foreground">{u.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[departments.data?.find((d) => d.id === u.departmentId)?.name, u.shift].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>

        <Section title="This month">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dd className="text-xl font-semibold tabular-nums">{completed.data ? month.length : '–'}</dd>
              <dt className="text-xs text-muted-foreground">Jobs done</dt>
            </div>
            <div>
              <dd className="text-xl font-semibold tabular-nums">{completed.data ? formatHours(month.reduce((s, w) => s + w.laborHours, 0)) : '–'}</dd>
              <dt className="text-xs text-muted-foreground">Hours logged</dt>
            </div>
            <div>
              <dd className="text-xl font-semibold tabular-nums">{completed.data ? formatHours(mttrHours(month)) : '–'}</dd>
              <dt className="text-xs text-muted-foreground">Avg repair</dt>
            </div>
          </dl>
        </Section>

        {u.skills.length > 0 && (
          <Section title="Skills & certifications">
            <ul className="flex flex-wrap gap-1.5">
              {u.skills.map((s) => (
                <li key={s}>
                  <Badge tone="primary">{s}</Badge>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Contact">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" aria-hidden /> {u.email}
            </li>
            {u.phone && (
              <li className="flex items-center gap-2">
                <Phone className="size-4 text-muted-foreground" aria-hidden /> {u.phone}
              </li>
            )}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">To change your details or skills, ask your administrator.</p>
        </Section>

        <div className="grid gap-2 pt-2">
          {demo && (
            <Button variant="outline" size="lg" onClick={() => navigate('/login?switch=1')}>
              <Repeat /> Switch demo role
            </Button>
          )}
          <Button
            variant="outline"
            size="lg"
            className="text-danger"
            onClick={async () => {
              await signOut()
              navigate('/login', { replace: true })
            }}
          >
            <LogOut /> Sign out
          </Button>
        </div>
      </div>
    </>
  )
}
