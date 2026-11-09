import { useMutation, useQuery } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useInvalidate } from '@/features/shared/queries'
import { formatAgo } from '@/lib/format'
import { cn } from '@/lib/utils'
import { services } from '@/services'

export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate()
  const invalidate = useInvalidate()
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => services.notifications.list(), refetchInterval: 60_000 })
  const markRead = useMutation({ mutationFn: (id: string) => services.notifications.markRead(id), onSuccess: () => invalidate('notifications') })
  const markAll = useMutation({ mutationFn: () => services.notifications.markAllRead(), onSuccess: () => invalidate('notifications') })

  const items = query.data ?? []
  const unread = items.filter((n) => !n.read).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('relative', className)} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1rem)] p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0 text-sm text-foreground">Notifications</DropdownMenuLabel>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7" onClick={() => markAll.mutate()}>
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-96 overflow-y-auto p-1">
          {query.isPending && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {query.isSuccess && items.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</p>}
          {items.slice(0, 20).map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="items-start gap-3 py-2"
              onSelect={() => {
                if (!n.read) markRead.mutate(n.id)
                if (n.link) navigate(n.link)
              }}
            >
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-info')} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={cn('block text-sm', !n.read && 'font-medium')}>{n.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{n.body}</span>
                <span className="block text-[11px] text-muted-foreground">{formatAgo(n.atUtc)}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
