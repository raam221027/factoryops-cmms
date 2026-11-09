import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { FilterSelect } from '@/components/shared/filters'
import { MonthCalendar, type CalendarEvent } from '@/components/shared/MonthCalendar'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState, ListSkeleton } from '@/components/shared/states'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { isOpen, isOverdue } from '@/domain/workOrderRules'
import { useLookups } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { WeekPlanner } from './WeekPlanner'

export function SchedulePage() {
  const navigate = useNavigate()
  const workOrders = useWorkOrders()
  const { lookups, ready, error } = useLookups()
  const [technician, setTechnician] = useState('')

  const technicians = useMemo(
    () => [...lookups.users.values()].filter((u) => u.role === 'Technician' && u.active).sort((a, b) => a.name.localeCompare(b.name)),
    [lookups],
  )

  const events = useMemo<CalendarEvent[]>(
    () =>
      (workOrders.data ?? [])
        .filter((wo) => wo.status !== 'Cancelled' && (wo.scheduledDate ?? wo.dueDate))
        .filter((wo) => (technician === 'none' ? !wo.assigneeId : !technician || wo.assigneeId === technician))
        .map((wo) => ({
          id: wo.id,
          date: (wo.scheduledDate ?? wo.dueDate)!,
          label: `${wo.number} · ${lookups.equipment.get(wo.equipmentId)?.name ?? wo.title}${isOpen(wo) && !wo.assigneeId ? ' · unassigned' : ''}`,
          tone: wo.status === 'Completed' ? 'success' : isOverdue(wo) ? 'danger' : wo.status === 'OnHold' ? 'warning' : 'default',
          onClick: () => navigate(`/supervisor/work-orders/${wo.id}`),
        })),
    [workOrders.data, technician, lookups, navigate],
  )

  const failed = workOrders.error ?? error

  return (
    <>
      <PageHeader title="Schedule" description="Plan who does what, and when. Changes notify the technician." />
      {failed ? (
        <ErrorState error={failed} onRetry={() => void workOrders.refetch()} />
      ) : !workOrders.data || !ready ? (
        <ListSkeleton rows={8} />
      ) : (
        <Tabs defaultValue="week">
          <TabsList className="mb-4">
            <TabsTrigger value="week">Week by technician</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
          </TabsList>
          <TabsContent value="week" className="pt-0">
            <WeekPlanner workOrders={workOrders.data} technicians={technicians} lookups={lookups} />
          </TabsContent>
          <TabsContent value="month" className="pt-0">
            <Card>
              <CardContent>
                <MonthCalendar
                  events={events}
                  toolbar={
                    <FilterSelect
                      label="Technician"
                      value={technician}
                      onChange={setTechnician}
                      options={[{ value: 'none', label: 'Unassigned' }, ...technicians.map((t) => ({ value: t.id, label: t.name }))]}
                      className="sm:w-52"
                    />
                  }
                />
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
                  <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-primary-soft ring-1 ring-primary/40" /> Planned</li>
                  <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-danger-soft ring-1 ring-danger/40" /> Overdue</li>
                  <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-warning-soft ring-1 ring-warning/40" /> On hold</li>
                  <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-success-soft ring-1 ring-success/40" /> Completed</li>
                </ul>
                <p className="mt-1 text-xs text-muted-foreground">Jobs without a planned day are shown on their due date.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </>
  )
}
