import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { Department, Equipment, EquipmentCategory, EquipmentLocation, Facility, User } from '@/domain/types'
import { services } from '@/services'

/*
 * Query key roots. Every key starts with its domain so a mutation can invalidate a whole
 * domain at once.
 */
export type Domain =
  | 'workOrders'
  | 'requests'
  | 'equipment'
  | 'users'
  | 'org'
  | 'pm'
  | 'inventory'
  | 'downtime'
  | 'notifications'
  | 'settings'

/** Domains whose data a work order change can affect on the server. */
export const WORK_ORDER_EFFECTS: Domain[] = ['workOrders', 'requests', 'equipment', 'downtime', 'pm', 'inventory', 'notifications']

export function useInvalidate() {
  const queryClient = useQueryClient()
  return useCallback(
    (...domains: Domain[]) => Promise.all(domains.map((d) => queryClient.invalidateQueries({ queryKey: [d] }))),
    [queryClient],
  )
}

/** Reference data changes rarely, so it is cached longer. */
const REFERENCE_STALE_MS = 5 * 60_000

export function useEquipmentList() {
  return useQuery({ queryKey: ['equipment', 'all'], queryFn: () => services.equipment.list(), staleTime: 30_000 })
}

export function useUsersList() {
  return useQuery({ queryKey: ['users', 'all'], queryFn: () => services.users.list(), staleTime: REFERENCE_STALE_MS })
}

export function useLocations() {
  return useQuery({ queryKey: ['org', 'locations'], queryFn: () => services.organization.listLocations(), staleTime: REFERENCE_STALE_MS })
}

export function useDepartments() {
  return useQuery({ queryKey: ['org', 'departments'], queryFn: () => services.organization.listDepartments(), staleTime: REFERENCE_STALE_MS })
}

export function useFacilities() {
  return useQuery({ queryKey: ['org', 'facilities'], queryFn: () => services.organization.listFacilities(), staleTime: REFERENCE_STALE_MS })
}

export function useCategories() {
  return useQuery({ queryKey: ['org', 'categories'], queryFn: () => services.organization.listCategories(), staleTime: REFERENCE_STALE_MS })
}

export interface Lookups {
  equipment: Map<string, Equipment>
  users: Map<string, User>
  locations: Map<string, EquipmentLocation>
  departments: Map<string, Department>
  facilities: Map<string, Facility>
  categories: Map<string, EquipmentCategory>
  equipmentName(id: string | undefined): string
  userName(id: string | undefined, fallback?: string): string
  /** "Assembly Line 1 · P1" style location label for a piece of equipment */
  locationLabel(equipmentId: string | undefined): string
}

/**
 * Id → entity maps for rendering names next to ids. Returns `ready: false` until all
 * reference lists have loaded.
 */
export function useLookups(): { lookups: Lookups; ready: boolean; error: unknown } {
  const equipment = useEquipmentList()
  const users = useUsersList()
  const locations = useLocations()
  const departments = useDepartments()
  const facilities = useFacilities()
  const categories = useCategories()
  const all = [equipment, users, locations, departments, facilities, categories]

  const lookups = useMemo<Lookups>(() => {
    const toMap = <T extends { id: string }>(items: T[] | undefined) => new Map((items ?? []).map((x) => [x.id, x]))
    const eq = toMap(equipment.data)
    const us = toMap(users.data)
    const lo = toMap(locations.data)
    const fa = toMap(facilities.data)
    return {
      equipment: eq,
      users: us,
      locations: lo,
      departments: toMap(departments.data),
      facilities: fa,
      categories: toMap(categories.data),
      equipmentName: (id) => (id && eq.get(id)?.name) || 'Unknown equipment',
      userName: (id, fallback = 'Unassigned') => (id && us.get(id)?.name) || fallback,
      locationLabel: (equipmentId) => {
        const loc = equipmentId ? lo.get(eq.get(equipmentId)?.locationId ?? '') : undefined
        if (!loc) return '—'
        const facility = fa.get(loc.facilityId)
        return facility ? `${loc.name} · ${facility.code}` : loc.name
      },
    }
  }, [equipment.data, users.data, locations.data, departments.data, facilities.data, categories.data])

  return { lookups, ready: all.every((q) => q.isSuccess), error: all.find((q) => q.error)?.error }
}
