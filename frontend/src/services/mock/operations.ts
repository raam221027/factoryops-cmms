import { parseISO } from 'date-fns'
import type { PmSchedule, SparePart, WorkOrder } from '@/domain/types'
import { isOpen } from '@/domain/workOrderRules'
import { newId } from '@/lib/id'
import type { DowntimeService, InventoryService, NotificationService, PmService, SettingsService } from '../contracts'
import { ApiError } from '../errors'
import { addLog, nextWorkOrderNumber, notifyRole, notifyUser, nowIso } from './effects'
import type { DemoDb } from './schema'
import { actor, authorize, findOrThrow, read, write } from './store'

function validateSchedule(d: DemoDb, input: Omit<PmSchedule, 'id' | 'lastCompletedDate'>) {
  findOrThrow(d.equipment, input.equipmentId, 'Equipment')
  if (input.assigneeId) findOrThrow(d.users, input.assigneeId, 'Technician')
  if (!Number.isInteger(input.frequencyInterval) || input.frequencyInterval < 1) throw new ApiError('validation', 'Frequency must be at least 1.')
  if (input.checklist.length === 0) throw new ApiError('validation', 'Add at least one checklist item.')
}

export const mockPm: PmService = {
  list: () => read((d) => (authorize(d, 'pm.view'), d.pmSchedules)),
  get: (id) => read((d) => (authorize(d, 'pm.view'), findOrThrow(d.pmSchedules, id, 'PM schedule'))),
  create: (input) =>
    write((d) => {
      authorize(d, 'pm.manage')
      validateSchedule(d, input)
      const s: PmSchedule = { ...input, id: newId() }
      d.pmSchedules.push(s)
      return s
    }),
  update: (id, input) =>
    write((d) => {
      authorize(d, 'pm.manage')
      const s = findOrThrow(d.pmSchedules, id, 'PM schedule')
      validateSchedule(d, input)
      return Object.assign(s, input)
    }),
  generateWorkOrder: (id) =>
    write((d) => {
      const user = authorize(d, 'pm.manage', 'workorder.create')
      const s = findOrThrow(d.pmSchedules, id, 'PM schedule')
      if (!s.active) throw new ApiError('conflict', 'This schedule is paused.')
      const existing = d.workOrders.find((w) => w.pmScheduleId === s.id && isOpen(w) && w.dueDate === s.nextDueDate)
      if (existing) throw new ApiError('conflict', `Work order ${existing.number} already exists for ${s.nextDueDate}.`)
      const wo: WorkOrder = {
        id: newId(),
        number: nextWorkOrderNumber(d),
        type: 'Preventive',
        title: s.name,
        description: `Scheduled preventive maintenance (${s.frequencyInterval} ${s.frequencyUnit.toLowerCase()} interval).`,
        equipmentId: s.equipmentId,
        pmScheduleId: s.id,
        priority: s.priority,
        status: s.assigneeId ? 'Assigned' : 'New',
        assigneeId: s.assigneeId,
        createdById: user.id,
        createdAtUtc: nowIso(),
        scheduledDate: s.nextDueDate,
        dueDate: s.nextDueDate,
        instructions: 'Follow the checklist. Apply lockout/tagout where required. Report any abnormal findings as a new work order.',
        checklist: s.checklist.map((label) => ({ id: newId(), label, done: false })),
        laborHours: 0,
        partsRequired: [],
        partsUsed: [],
        attachments: [],
      }
      d.workOrders.unshift(wo)
      addLog(d, wo, user.id, 'Created', `Generated from PM schedule "${s.name}"`)
      if (wo.assigneeId) notifyUser(d, wo.assigneeId, 'Preventive maintenance assigned', `${wo.number}: ${wo.title}`, `/tech/jobs/${wo.id}`)
      return wo
    }),
}

export const mockInventory: InventoryService = {
  listParts: () => read((d) => (authorize(d, 'inventory.view'), d.parts)),
  savePart: ({ id, quantityOnHand, ...input }) =>
    write((d) => {
      authorize(d, 'inventory.manage')
      if (d.parts.some((p) => p.partNumber.toLowerCase() === input.partNumber.toLowerCase() && p.id !== id)) {
        throw new ApiError('validation', `Part number "${input.partNumber}" is already in use.`)
      }
      if (id) return Object.assign(findOrThrow(d.parts, id, 'Spare part'), input)
      const part: SparePart = { ...input, id: newId(), quantityOnHand: quantityOnHand ?? 0 }
      d.parts.push(part)
      return part
    }),
  adjustStock: (partId, type, quantity, note) =>
    write((d) => {
      const user = authorize(d, 'inventory.manage')
      const part = findOrThrow(d.parts, partId, 'Spare part')
      if (!Number.isInteger(quantity) || quantity === 0) throw new ApiError('validation', 'Quantity must be a non-zero whole number.')
      const delta = type === 'Receipt' ? Math.abs(quantity) : type === 'Issue' ? -Math.abs(quantity) : quantity
      if (part.quantityOnHand + delta < 0) throw new ApiError('conflict', `Only ${part.quantityOnHand} ${part.unit} in stock.`)
      part.quantityOnHand += delta
      d.transactions.push({ id: newId(), partId, type, quantity: delta, userId: user.id, atUtc: nowIso(), note: note?.trim() || undefined })
      if (d.settings.lowStockAlerts && delta < 0 && part.quantityOnHand <= part.minimumStock) {
        notifyRole(d, 'Admin', 'Low stock', `${part.name} is at ${part.quantityOnHand} ${part.unit} (min ${part.minimumStock})`, '/admin/inventory')
      }
      return part
    }),
  listTransactions: (partId) =>
    read((d) => {
      authorize(d, 'inventory.view')
      return d.transactions.filter((t) => !partId || t.partId === partId).sort((a, b) => b.atUtc.localeCompare(a.atUtc))
    }),
}

export const mockDowntime: DowntimeService = {
  list: () => read((d) => (authorize(d, 'reports.view', 'equipment.view'), d.downtimes)),
}

export const mockNotifications: NotificationService = {
  list: () =>
    read((d) => {
      const user = actor(d)
      return d.notifications.filter((n) => n.userId === user.id).sort((a, b) => parseISO(b.atUtc).getTime() - parseISO(a.atUtc).getTime())
    }),
  markRead: (id) =>
    write((d) => {
      const user = actor(d)
      const n = d.notifications.find((x) => x.id === id && x.userId === user.id)
      if (n) n.read = true
    }),
  markAllRead: () =>
    write((d) => {
      const user = actor(d)
      for (const n of d.notifications) if (n.userId === user.id) n.read = true
    }),
}

export const mockSettings: SettingsService = {
  get: () => read((d) => (actor(d), d.settings)),
  update: (input) =>
    write((d) => {
      authorize(d, 'settings.manage')
      if (!/^[A-Z]{1,5}$/.test(input.workOrderPrefix) || !/^[A-Z]{1,5}$/.test(input.requestPrefix)) {
        throw new ApiError('validation', 'Prefixes must be 1–5 uppercase letters.')
      }
      return Object.assign(d.settings, input)
    }),
}
