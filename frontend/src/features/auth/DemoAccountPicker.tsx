import { useQuery } from '@tanstack/react-query'
import { ClipboardList, HardHat, Monitor, Settings2, Smartphone, Tablet, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/input'
import { ROLES, ROLE_LABELS, type Role } from '@/domain/enums'
import { ErrorState } from '@/components/shared/states'
import { Skeleton } from '@/components/ui/misc'
import { errorMessage } from '@/services'
import type { DemoAuthService } from '@/services/mock/auth'

const ROLE_INFO: Record<Role, { icon: LucideIcon; device: LucideIcon; deviceLabel: string; summary: string }> = {
  Admin: { icon: Settings2, device: Monitor, deviceLabel: 'Desktop', summary: 'Assets, users, PM schedules, inventory and analytics' },
  Supervisor: { icon: ClipboardList, device: Tablet, deviceLabel: 'Desktop / tablet', summary: 'Review requests, assign work, monitor operations' },
  Technician: { icon: HardHat, device: Smartphone, deviceLabel: 'Phone', summary: 'Execute work orders, scan equipment, log parts' },
  Operator: { icon: Smartphone, device: Smartphone, deviceLabel: 'Phone / kiosk', summary: 'Report breakdowns in three steps' },
}

/** DEVELOPMENT ONLY: pick any seeded account to preview a role experience. */
export function DemoAccountPicker({ demo, onSelect }: { demo: DemoAuthService; onSelect: (userId: string) => Promise<unknown> }) {
  const accounts = useQuery({ queryKey: ['demo-accounts'], queryFn: () => demo.listAccounts() })
  const [selected, setSelected] = useState<Partial<Record<Role, string>>>({})
  const [busyRole, setBusyRole] = useState<Role | null>(null)
  const [error, setError] = useState<string>()

  if (accounts.isPending) return <div className="grid gap-3 sm:grid-cols-2">{ROLES.map((r) => <Skeleton key={r} className="h-40" />)}</div>
  if (accounts.error) return <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />

  async function go(role: Role) {
    const userId = selected[role] ?? accounts.data!.find((a) => a.role === role)?.id
    if (!userId) return
    setBusyRole(role)
    setError(undefined)
    try {
      await onSelect(userId)
    } catch (e) {
      setError(errorMessage(e))
      setBusyRole(null)
    }
  }

  return (
    <div>
      {error && <p role="alert" className="mb-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {ROLES.map((role) => {
          const info = ROLE_INFO[role]
          const people = accounts.data.filter((a) => a.role === role)
          return (
            <div key={role} className="flex flex-col rounded-lg border bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className="rounded-md bg-primary-soft p-2 text-primary">
                  <info.icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{ROLE_LABELS[role]}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <info.device className="size-3" aria-hidden /> {info.deviceLabel}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{info.summary}</p>
              <div className="mt-auto flex gap-2 pt-3">
                <NativeSelect
                  aria-label={`${ROLE_LABELS[role]} account`}
                  className="min-w-0 flex-1"
                  value={selected[role] ?? people[0]?.id ?? ''}
                  onChange={(e) => setSelected((s) => ({ ...s, [role]: e.target.value }))}
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </NativeSelect>
                <Button className="shrink-0" onClick={() => void go(role)} loading={busyRole === role} disabled={!people.length || (busyRole !== null && busyRole !== role)}>
                  Enter
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
