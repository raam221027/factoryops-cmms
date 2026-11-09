import type { Equipment, User } from '@/domain/types'
import { newId } from '@/lib/id'
import { matchesQuery } from '@/lib/utils'
import type { EquipmentService, OrganizationService, UserService } from '../contracts'
import { ApiError } from '../errors'
import { nowIso } from './effects'
import type { DemoDb } from './schema'
import { actor, authorize, findOrThrow, read, write } from './store'

/** Insert-or-update helper for simple reference collections. */
function upsert<T extends { id: string }>(items: T[], input: Omit<T, 'id'> & { id?: string }): T {
  if (input.id) {
    const existing = findOrThrow(items, input.id, 'Record')
    Object.assign(existing, input)
    return existing
  }
  const created = { ...input, id: newId() } as T
  items.push(created)
  return created
}

function requireUnique<T>(items: T[], pick: (x: T) => string, value: string, exceptId: string | undefined, getId: (x: T) => string, label: string) {
  if (items.some((x) => pick(x).toLowerCase() === value.toLowerCase() && getId(x) !== exceptId)) {
    throw new ApiError('validation', `${label} "${value}" is already in use.`)
  }
}

export const mockOrganization: OrganizationService = {
  getOrganization: () =>
    read((d) => {
      actor(d)
      return d.organizations[0]!
    }),
  updateOrganization: (input) =>
    write((d) => {
      authorize(d, 'org.manage')
      return Object.assign(d.organizations[0]!, input)
    }),
  listFacilities: () => read((d) => (actor(d), d.facilities)),
  saveFacility: (input) =>
    write((d) => {
      authorize(d, 'org.manage')
      requireUnique(d.facilities, (x) => x.code, input.code, input.id, (x) => x.id, 'Facility code')
      return upsert(d.facilities, { ...input, organizationId: d.organizations[0]!.id })
    }),
  listDepartments: () => read((d) => (actor(d), d.departments)),
  saveDepartment: (input) =>
    write((d) => {
      authorize(d, 'org.manage')
      findOrThrow(d.facilities, input.facilityId, 'Facility')
      requireUnique(d.departments, (x) => x.code, input.code, input.id, (x) => x.id, 'Department code')
      return upsert(d.departments, input)
    }),
  listLocations: () => read((d) => (actor(d), d.locations)),
  saveLocation: (input) =>
    write((d) => {
      authorize(d, 'org.manage')
      const dept = findOrThrow(d.departments, input.departmentId, 'Department')
      requireUnique(d.locations, (x) => x.code, input.code, input.id, (x) => x.id, 'Location code')
      return upsert(d.locations, { ...input, facilityId: dept.facilityId })
    }),
  listCategories: () => read((d) => (actor(d), d.categories)),
  saveCategory: (input) =>
    write((d) => {
      authorize(d, 'equipment.manage')
      requireUnique(d.categories, (x) => x.code, input.code, input.id, (x) => x.id, 'Category code')
      return upsert(d.categories, input)
    }),
}

function nextAssetId(d: DemoDb, categoryId: string): string {
  const category = findOrThrow(d.categories, categoryId, 'Category')
  const prefix = `${category.code}-`
  const max = d.equipment
    .filter((e) => e.assetId.startsWith(prefix))
    .map((e) => Number.parseInt(e.assetId.slice(prefix.length), 10))
    .filter(Number.isFinite)
    .reduce((a, b) => Math.max(a, b), 0)
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

function validateEquipment(d: DemoDb, input: { assetId?: string; serialNumber: string; departmentId: string; locationId: string; categoryId: string }, exceptId?: string) {
  findOrThrow(d.categories, input.categoryId, 'Category')
  findOrThrow(d.departments, input.departmentId, 'Department')
  findOrThrow(d.locations, input.locationId, 'Location')
  if (input.assetId) requireUnique(d.equipment, (x) => x.assetId, input.assetId, exceptId, (x) => x.id, 'Asset ID')
  if (input.serialNumber) requireUnique(d.equipment, (x) => x.serialNumber, input.serialNumber, exceptId, (x) => x.id, 'Serial number')
}

export const mockEquipment: EquipmentService = {
  list: (filter = {}) =>
    read((d) => {
      actor(d)
      return d.equipment.filter(
        (e) =>
          (!filter.status || e.status === filter.status) &&
          (!filter.categoryId || e.categoryId === filter.categoryId) &&
          (!filter.departmentId || e.departmentId === filter.departmentId) &&
          (!filter.locationId || e.locationId === filter.locationId) &&
          matchesQuery(filter.search ?? '', e.name, e.assetId, e.serialNumber, e.manufacturer, e.model),
      )
    }),
  get: (id) => read((d) => (actor(d), findOrThrow(d.equipment, id, 'Equipment'))),
  findByAssetId: (assetId) =>
    read((d) => {
      actor(d)
      const needle = assetId.trim().toLowerCase()
      return d.equipment.find((e) => e.assetId.toLowerCase() === needle) ?? null
    }),
  nextAssetId: (categoryId) => read((d) => (actor(d), nextAssetId(d, categoryId))),
  create: (input) =>
    write((d) => {
      authorize(d, 'equipment.manage')
      validateEquipment(d, input)
      const e: Equipment = {
        ...input,
        id: newId(),
        organizationId: d.organizations[0]!.id,
        assetId: input.assetId?.trim() || nextAssetId(d, input.categoryId),
        createdAtUtc: nowIso(),
      }
      d.equipment.push(e)
      return e
    }),
  update: (id, input) =>
    write((d) => {
      authorize(d, 'equipment.manage')
      const e = findOrThrow(d.equipment, id, 'Equipment')
      validateEquipment(d, input, id)
      return Object.assign(e, input, { assetId: input.assetId?.trim() || e.assetId })
    }),
}

function validateUser(d: DemoDb, input: { email: string; departmentId?: string }, exceptId?: string) {
  if (input.departmentId) findOrThrow(d.departments, input.departmentId, 'Department')
  requireUnique(d.users, (x) => x.email, input.email, exceptId, (x) => x.id, 'Email')
}

export const mockUsers: UserService = {
  list: (filter = {}) =>
    read((d) => {
      actor(d)
      return d.users.filter(
        (u) =>
          (!filter.role || u.role === filter.role) &&
          (filter.active === undefined || u.active === filter.active) &&
          matchesQuery(filter.search ?? '', u.name, u.email, u.title),
      )
    }),
  get: (id) => read((d) => (actor(d), findOrThrow(d.users, id, 'User'))),
  create: (input) =>
    write((d) => {
      authorize(d, 'user.manage')
      validateUser(d, input)
      const u: User = { ...input, id: newId(), organizationId: d.organizations[0]!.id, createdAtUtc: nowIso() }
      d.users.push(u)
      return u
    }),
  update: (id, input) =>
    write((d) => {
      const me = authorize(d, 'user.manage')
      const u = findOrThrow(d.users, id, 'User')
      validateUser(d, input, id)
      if (u.id === me.id && (input.role !== u.role || !input.active)) {
        throw new ApiError('validation', 'You cannot change your own role or deactivate yourself.')
      }
      return Object.assign(u, input)
    }),
  setActive: (id, active) =>
    write((d) => {
      const me = authorize(d, 'user.manage')
      const u = findOrThrow(d.users, id, 'User')
      if (u.id === me.id) throw new ApiError('validation', 'You cannot deactivate your own account.')
      if (!active && d.workOrders.some((w) => w.assigneeId === id && w.status === 'InProgress')) {
        throw new ApiError('conflict', `${u.name} has work in progress. Reassign it first.`)
      }
      u.active = active
      return u
    }),
  activity: (id, limit = 25) =>
    read((d) => {
      authorize(d, 'user.manage')
      findOrThrow(d.users, id, 'User')
      return d.workLogs
        .filter((l) => l.userId === id)
        .sort((a, b) => b.atUtc.localeCompare(a.atUtc))
        .slice(0, limit)
    }),
}
