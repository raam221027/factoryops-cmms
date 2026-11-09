import { AlertTriangle, ClipboardCheck, Inbox, Loader } from 'lucide-react'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState, KpiSkeletonRow } from '@/components/shared/states'
import { countByStatus, overdueCount } from '@/domain/metrics'
import { useSessionUser } from '@/features/auth/context'
import { useRequests, useWorkOrders } from '@/features/work-orders/hooks'

export function SupervisorHome() {
  const user = useSessionUser()
  const workOrders = useWorkOrders()
  const requests = useRequests({ status: 'Submitted' })
  const failed = workOrders.error ?? requests.error

  return (
    <>
      <PageHeader title="Operations overview" description={`Good to see you, ${user.name.split(' ')[0]}.`} />
      {failed ? (
        <ErrorState error={failed} onRetry={() => (void workOrders.refetch(), void requests.refetch())} />
      ) : workOrders.data && requests.data ? (
        (() => {
          const counts = countByStatus(workOrders.data)
          return (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard label="Pending approval" value={requests.data.length} icon={Inbox} tone="info" hint="Requests awaiting review" />
              <KpiCard label="New work orders" value={counts.New} icon={ClipboardCheck} />
              <KpiCard label="In progress" value={counts.InProgress} icon={Loader} tone="warning" />
              <KpiCard label="Overdue" value={overdueCount(workOrders.data)} icon={AlertTriangle} tone="danger" />
            </div>
          )
        })()
      ) : (
        <KpiSkeletonRow />
      )}
    </>
  )
}
