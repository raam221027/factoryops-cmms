import { LogOut, RefreshCcw, Repeat, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Avatar } from '@/components/ui/misc'
import { ROLE_LABELS } from '@/domain/enums'
import { useAuth, useSessionUser } from '@/features/auth/context'
import { cn } from '@/lib/utils'

export function UserMenu({ profilePath, compact = false }: { profilePath?: string; compact?: boolean }) {
  const user = useSessionUser()
  const { signOut, demo } = useAuth()
  const navigate = useNavigate()
  const [confirmReset, setConfirmReset] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className={cn('flex items-center gap-2 rounded-md p-1 text-left hover:bg-accent', !compact && 'pr-2')} aria-label="Account menu">
          <Avatar name={user.name} />
          {!compact && (
            <span className="hidden min-w-0 md:block">
              <span className="block truncate text-sm font-medium leading-tight">{user.name}</span>
              <span className="block truncate text-xs leading-tight text-muted-foreground">{ROLE_LABELS[user.role]}</span>
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-foreground">
            <span className="block text-sm font-medium">{user.name}</span>
            <span className="block text-xs font-normal text-muted-foreground">{user.title}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {profilePath && (
            <DropdownMenuItem onSelect={() => navigate(profilePath)}>
              <UserRound /> My profile
            </DropdownMenuItem>
          )}
          {demo && (
            <>
              <DropdownMenuItem onSelect={() => navigate('/login?switch=1')}>
                <Repeat /> Switch demo role
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setConfirmReset(true)}>
                <RefreshCcw /> Reset demo data
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleSignOut}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {demo && (
        <ConfirmDialog
          open={confirmReset}
          onOpenChange={setConfirmReset}
          title="Reset demo data?"
          description="All changes made in this browser are discarded and the sample data is regenerated. You will be signed out."
          confirmLabel="Reset data"
          destructive
          onConfirm={async () => {
            await demo.resetData()
            await signOut()
            toast.success('Demo data reset')
            navigate('/login', { replace: true })
          }}
        />
      )}
    </>
  )
}
