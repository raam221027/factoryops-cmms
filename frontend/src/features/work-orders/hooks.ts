import { useQuery } from '@tanstack/react-query'
import { services, type RequestFilter, type WorkOrderFilter } from '@/services'

export function useWorkOrders(filter: WorkOrderFilter = {}) {
  return useQuery({ queryKey: ['workOrders', 'list', filter], queryFn: () => services.workOrders.list(filter) })
}

export function useRequests(filter: RequestFilter = {}) {
  return useQuery({ queryKey: ['requests', 'list', filter], queryFn: () => services.requests.list(filter) })
}
