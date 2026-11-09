import { useMutation, useQuery } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useInvalidate } from '@/features/shared/queries'
import { formatAgo } from '@/lib/format'
import { internalPath } from '@/lib/url'
import { cn } from '@/lib/utils'
import { services } from '@/services'

/**
 * Bell with the latest notifications. A popover (not a menu): it holds a heading, an action and
 * a list, which menus are not allowed to contain.
 */
export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate()
  const invalidate = useInvalidate()
  const headingId = useId()
  const [open, setOpen] = useState(false)
  const query = useQuery({ queryKey: ['notifications'], queryFn: () => services.notifications.list(), refetchInterval: 60_000 })
  const markRead = useMutation({ mutationFn: (id: string) => services.notifications.markRead(id), onSuccess: () => invalidate('notifications') })
  const markAll = useMutation({ mutationFn: () => services.notifications.markAllRead(), onSuccess: () => invalidate('notifications') })

  const items = query.data ?? []
  const unread = items.filter((n) => !n.read).length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('relative', className)} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
          <Bell />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white" aria-hidden>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-1rem)]" aria-labelledby={headingId}>
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 id={headingId} className="text-sm font-semibold">
            Notifications
          </h2>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7" onClick={() => markAll.mutate()}>
              <CheckCheck /> Mark all read
            </Button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {query.isPending && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {query.isError && <p className="px-3 py-6 text-center text-sm text-muted-foreground">Notifications could not be loaded.</p>}
          {query.isSuccess && items.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">You're all caught up.</p>}
          {items.length > 0 && (
            <ul>
              {items.slice(0, 20).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 rounded-sm px-2 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    onClick={() => {
                      if (!n.read) markRead.mutate(n.id)
                      const path = internalPath(n.link)
                      setOpen(false)
                      if (path) navigate(path)
                    }}
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-info')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm', !n.read && 'font-medium')}>
                        {!n.read && <span className="sr-only">Unread: </span>}
                        {n.title}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{n.body}</span>
                      <span className="block text-[11px] text-muted-foreground">{formatAgo(n.atUtc)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
