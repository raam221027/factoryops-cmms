import { useState } from 'react'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/misc'
import type { WorkOrder } from '@/domain/types'
import { isOpen } from '@/domain/workOrderRules'
import { useServiceMutation } from '@/features/shared/mutations'
import type { Lookups } from '@/features/shared/queries'
import { formatAgo, formatDateTime } from '@/lib/format'
import { services } from '@/services'
import { useWorkOrderLogs } from './hooks'

/** Audit trail of a work order, newest first, with a box for adding notes while it is open. */
export function ActivityLog({ wo, lookups }: { wo: WorkOrder; lookups: Lookups }) {
  const logs = useWorkOrderLogs(wo.id)
  const [note, setNote] = useState('')
  const add = useServiceMutation((text: string) => services.workOrders.addNote(wo.id, text), {
    invalidates: ['workOrders'],
    success: 'Note added',
    onSuccess: () => setNote(''),
  })

  return (
    <div className="space-y-4">
      {isOpen(wo) && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (note.trim()) add.mutate(note.trim())
          }}
        >
          <label htmlFor="wo-note" className="sr-only">
            Add a note
          </label>
          <Textarea id="wo-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the technician or the record…" className="min-h-16" />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!note.trim()} loading={add.isPending}>
              Add note
            </Button>
          </div>
        </form>
      )}
      {logs.isPending ? (
        <ListSkeleton rows={3} />
      ) : logs.error ? (
        <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />
      ) : (
        <ol className="relative space-y-4 before:absolute before:inset-y-1 before:left-4 before:w-px before:bg-border">
          {logs.data.map((log) => (
            <li key={log.id} className="relative flex gap-3">
              <Avatar name={lookups.userName(log.userId, 'System')} className="relative ring-4 ring-surface" />
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm">
                  <span className="font-medium">{lookups.userName(log.userId, 'System')}</span>{' '}
                  <span className={log.action === 'Note' ? 'whitespace-pre-line' : 'text-muted-foreground'}>{log.message}</span>
                </p>
                <time dateTime={log.atUtc} title={formatDateTime(log.atUtc)} className="text-xs text-muted-foreground">
                  {formatAgo(log.atUtc)}
                </time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
