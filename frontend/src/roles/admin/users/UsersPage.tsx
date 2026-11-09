import { useQuery } from '@tanstack/react-query'
import { MoreHorizontal, Pencil, Plus, UserCheck, UserX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { CellStack, DataTable, type ColumnDef } from '@/components/shared/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filters'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar } from '@/components/ui/misc'
import { ROLE_LABELS, ROLES, type Role } from '@/domain/enums'
import type { User } from '@/domain/types'
import { useSessionUser } from '@/features/auth/context'
import { useServiceMutation } from '@/features/shared/mutations'
import { useLookups, useUsersList } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { formatAgo, formatDate, formatDateTime } from '@/lib/format'
import { matchesQuery } from '@/lib/utils'
import { services } from '@/services'
import { UserDialog } from './UserDialog'

const ROLE_TONE: Record<Role, 'primary' | 'info' | 'success' | 'neutral'> = { Admin: 'primary', Supervisor: 'info', Technician: 'success', Operator: 'neutral' }

export function UsersPage() {
  const me = useSessionUser()
  const users = useUsersList()
  const { lookups } = useLookups()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<Role | ''>('')
  const [status, setStatus] = useState<'active' | 'inactive' | ''>('active')
  const [editing, setEditing] = useState<{ open: boolean; user?: User }>({ open: false })
  const [toggling, setToggling] = useState<User | null>(null)
  const [viewing, setViewing] = useState<User | null>(null)

  const setActive = useServiceMutation((u: User) => services.users.setActive(u.id, !u.active), {
    invalidates: ['users'],
    success: (u) => `${u.name} ${u.active ? 'reactivated' : 'deactivated'}`,
  })

  const rows = useMemo(
    () =>
      (users.data ?? []).filter(
        (u) => (!role || u.role === role) && (!status || u.active === (status === 'active')) && matchesQuery(search, u.name, u.email, u.title),
      ),
    [users.data, role, status, search],
  )

  const columns = useMemo<ColumnDef<User, unknown>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'User',
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <Avatar name={row.original.name} />
            <CellStack primary={row.original.name} secondary={row.original.email} />
          </div>
        ),
      },
      { accessorKey: 'role', header: 'Role', cell: ({ row }) => <Badge tone={ROLE_TONE[row.original.role]}>{ROLE_LABELS[row.original.role]}</Badge> },
      { accessorKey: 'title', header: 'Title' },
      { id: 'department', header: 'Department', accessorFn: (u) => lookups.departments.get(u.departmentId ?? '')?.name ?? '—' },
      { accessorKey: 'active', header: 'Status', cell: ({ row }) => (row.original.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
      { accessorKey: 'lastActiveAtUtc', header: 'Last active', cell: ({ row }) => formatAgo(row.original.lastActiveAtUtc) },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.original.name}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing({ open: true, user: row.original })}>
                  <Pencil /> Edit
                </DropdownMenuItem>
                {row.original.id !== me.id && (
                  <DropdownMenuItem destructive={row.original.active} onSelect={() => setToggling(row.original)}>
                    {row.original.active ? (
                      <>
                        <UserX /> Deactivate
                      </>
                    ) : (
                      <>
                        <UserCheck /> Reactivate
                      </>
                    )}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [lookups, me.id],
  )

  return (
    <>
      <PageHeader
        title="Users"
        description="People, their roles and departments. Roles decide which experience each user sees."
        actions={
          <Button onClick={() => setEditing({ open: true })}>
            <Plus /> Add user
          </Button>
        }
      />
      <Card>
        <FilterBar>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, email, title…" className="sm:w-72" />
          <FilterSelect label="Role" value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
          />
        </FilterBar>
        <DataTable
          data={users.data ? rows : undefined}
          columns={columns}
          getRowId={(u) => u.id}
          loading={users.isPending}
          error={users.error}
          onRetry={() => void users.refetch()}
          onRowClick={setViewing}
          initialSorting={[{ id: 'name', desc: false }]}
          rowClassName={(u) => (u.active ? undefined : 'text-muted-foreground')}
          emptyTitle="No users match"
        />
      </Card>

      <UserDialog open={editing.open} user={editing.user} onOpenChange={(open) => setEditing((s) => ({ ...s, open }))} />
      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.active ? `Deactivate ${toggling.name}?` : `Reactivate ${toggling?.name}?`}
        description={
          toggling?.active
            ? 'They will no longer be able to sign in or be assigned work. Their history is kept. Work in progress must be reassigned first.'
            : 'They will be able to sign in and be assigned work again.'
        }
        confirmLabel={toggling?.active ? 'Deactivate' : 'Reactivate'}
        destructive={toggling?.active}
        onConfirm={() => toggling && setActive.mutateAsync(toggling)}
      />
      <UserDetailDialog user={viewing} onOpenChange={(o) => !o && setViewing(null)} />
    </>
  )
}

function UserDetailDialog({ user, onOpenChange }: { user: User | null; onOpenChange: (o: boolean) => void }) {
  const { lookups } = useLookups()
  const activity = useQuery({ queryKey: ['users', 'activity', user?.id], queryFn: () => services.users.activity(user!.id), enabled: !!user })
  const workOrders = useWorkOrders()
  const numberOf = useMemo(() => new Map((workOrders.data ?? []).map((wo) => [wo.id, wo.number])), [workOrders.data])

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {user && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <Avatar name={user.name} className="size-10 text-sm" />
                <div>
                  <DialogTitle>{user.name}</DialogTitle>
                  <p className="text-sm text-muted-foreground">
                    {user.title} · {ROLE_LABELS[user.role]}
                  </p>
                </div>
              </div>
            </DialogHeader>
            <DialogBody className="space-y-5">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Email</dt>
                  <dd className="break-all">{user.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Phone</dt>
                  <dd>{user.phone ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Department</dt>
                  <dd>{lookups.departments.get(user.departmentId ?? '')?.name ?? '—'}</dd>
                </div>
                {user.role === 'Technician' && (
                  <>
                    <div>
                      <dt className="text-xs text-muted-foreground">Shift</dt>
                      <dd>{user.shift ?? '—'}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">Skills</dt>
                      <dd className="mt-0.5 flex flex-wrap gap-1">{user.skills.length ? user.skills.map((s) => <Badge key={s}>{s}</Badge>) : '—'}</dd>
                    </div>
                  </>
                )}
                <div>
                  <dt className="text-xs text-muted-foreground">Member since</dt>
                  <dd>{formatDate(user.createdAtUtc)}</dd>
                </div>
              </dl>
              <section>
                <h3 className="mb-2 text-sm font-semibold">Recent activity</h3>
                {activity.isPending ? (
                  <ListSkeleton rows={3} />
                ) : activity.error ? (
                  <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />
                ) : activity.data.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recorded activity.</p>
                ) : (
                  <ol className="space-y-2 border-l pl-4">
                    {activity.data.map((log) => (
                      <li key={log.id} className="relative text-sm">
                        <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary/60" aria-hidden />
                        <p>
                          {numberOf.has(log.workOrderId) && <span className="mr-1.5 font-mono text-xs text-muted-foreground">{numberOf.get(log.workOrderId)}</span>}
                          {log.message}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {log.action} · {formatDateTime(log.atUtc)}
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </DialogBody>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
