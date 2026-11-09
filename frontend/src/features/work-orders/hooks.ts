import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { WorkOrder } from '@/domain/types'
import { technicianWorkloads } from '@/domain/workload'
import { useServiceMutation } from '@/features/shared/mutations'
import { useUsersList, WORK_ORDER_EFFECTS } from '@/features/shared/queries'
import { services, type PlanWorkOrderInput, type RequestFilter, type WorkOrderFilter } from '@/services'

export function useWorkOrders(filter: WorkOrderFilter = {}) {
  return useQuery({ queryKey: ['workOrders', 'list', filter], queryFn: () => services.workOrders.list(filter) })
}

export function useWorkOrder(id: string) {
  return useQuery({ queryKey: ['workOrders', 'detail', id], queryFn: () => services.workOrders.get(id) })
}

export function useWorkOrderLogs(id: string) {
  return useQuery({ queryKey: ['workOrders', 'logs', id], queryFn: () => services.workOrders.logs(id) })
}

export function useRequests(filter: RequestFilter = {}) {
  return useQuery({ queryKey: ['requests', 'list', filter], queryFn: () => services.requests.list(filter) })
}

/** Assign and/or schedule a work order. */
export function usePlanWorkOrder(options: { success?: string | ((wo: WorkOrder) => string); onSuccess?: (wo: WorkOrder) => void } = {}) {
  return useServiceMutation(({ id, ...input }: PlanWorkOrderInput & { id: string }) => services.workOrders.plan(id, input), {
    invalidates: WORK_ORDER_EFFECTS,
    success: options.success ?? ((wo) => `${wo.number} updated`),
    onSuccess: options.onSuccess,
  })
}

/** Current queue of every active technician. */
export function useTechnicianWorkloads() {
  const users = useUsersList()
  const workOrders = useWorkOrders()
  const workloads = useMemo(() => (users.data && workOrders.data ? technicianWorkloads(users.data, workOrders.data) : undefined), [users.data, workOrders.data])
  return { workloads, error: users.error ?? workOrders.error, refetch: () => (void users.refetch(), void workOrders.refetch()) }
}
