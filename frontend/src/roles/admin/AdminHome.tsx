import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Cog, PackageX, Wrench, XOctagon } from 'lucide-react'
import { KpiCard } from '@/components/shared/KpiCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { ErrorState, KpiSkeletonRow } from '@/components/shared/states'
import { equipmentStatusCounts, lowStockParts, openCount, overdueCount } from '@/domain/metrics'
import { useSessionUser } from '@/features/auth/context'
import { useEquipmentList } from '@/features/shared/queries'
import { useWorkOrders } from '@/features/work-orders/hooks'
import { services } from '@/services'

export function AdminHome() {
  const user = useSessionUser()
  const equipment = useEquipmentList()
  const workOrders = useWorkOrders()
  const parts = useQuery({ queryKey: ['inventory', 'parts'], queryFn: () => services.inventory.listParts() })
  const queries = [equipment, workOrders, parts]
  const failed = queries.find((q) => q.error)

  return (
    <>
      <PageHeader title="Dashboard" description={`Welcome back, ${user.name.split(' ')[0]}. Plant-wide maintenance overview.`} />
      {failed ? (
        <ErrorState error={failed.error} onRetry={() => queries.forEach((q) => void q.refetch())} />
      ) : equipment.data && workOrders.data && parts.data ? (
        (() => {
          const eq = equipmentStatusCounts(equipment.data)
          return (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Total equipment" value={eq.total} icon={Cog} hint="Excludes retired assets" />
              <KpiCard label="Operational" value={eq.operational} icon={Cog} tone="success" hint={`${Math.round((eq.operational / eq.total) * 100)}% availability`} />
              <KpiCard label="Under maintenance" value={eq.underMaintenance} icon={Wrench} tone="warning" />
              <KpiCard label="Out of service" value={eq.outOfService} icon={XOctagon} tone="danger" />
              <KpiCard label="Open work orders" value={openCount(workOrders.data)} icon={ClipboardList} tone="info" hint={`${overdueCount(workOrders.data)} overdue`} />
              <KpiCard label="Low-stock parts" value={lowStockParts(parts.data).length} icon={PackageX} tone="warning" hint="At or below minimum stock" />
            </div>
          )
        })()
      ) : (
        <KpiSkeletonRow count={6} />
      )}
    </>
  )
}
