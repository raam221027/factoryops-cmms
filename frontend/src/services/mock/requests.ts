import { hasPermission } from '@/domain/permissions'
import type { MaintenanceRequest, WorkOrder } from '@/domain/types'
import { dueDateForPriority } from '@/domain/workOrderRules'
import { newId } from '@/lib/id'
import { PROBLEM_CATEGORY_LABELS } from '@/domain/enums'
import type { RequestService } from '../contracts'
import { ApiError } from '../errors'
import { addLog, nextRequestNumber, nextWorkOrderNumber, notifyRole, notifyUser, nowIso, userName } from './effects'
import { actor, authorize, findOrThrow, read, write } from './store'

export const mockRequests: RequestService = {
  list: (filter = {}) =>
    read((d) => {
      const user = actor(d)
      const all = hasPermission(user.role, 'request.review')
      return d.requests.filter((r) => {
        if ((!all || filter.mine) && r.requestedById !== user.id) return false
        if (filter.status && r.status !== filter.status) return false
        if (filter.equipmentId && r.equipmentId !== filter.equipmentId) return false
        return true
      })
    }),

  get: (id) =>
    read((d) => {
      const user = actor(d)
      const req = findOrThrow(d.requests, id, 'Request')
      if (!hasPermission(user.role, 'request.review') && req.requestedById !== user.id) {
        throw new ApiError('forbidden', 'You can only view your own requests.')
      }
      return req
    }),

  create: (input) =>
    write((d) => {
      const user = authorize(d, 'request.create')
      const equipment = findOrThrow(d.equipment, input.equipmentId, 'Equipment')
      if (input.description.trim().length < 10) throw new ApiError('validation', 'Please describe the problem in a few words.')
      const now = nowIso()
      const req: MaintenanceRequest = {
        id: newId(),
        number: nextRequestNumber(d),
        equipmentId: equipment.id,
        category: input.category,
        severity: input.severity,
        description: input.description.trim(),
        additionalInfo: input.additionalInfo?.trim() || undefined,
        attachments: input.attachments.map((a) => ({ id: newId(), ...a, uploadedById: user.id, uploadedAtUtc: now })),
        requestedById: user.id,
        createdAtUtc: now,
        status: 'Submitted',
      }
      d.requests.unshift(req)
      // A critical breakdown means the machine is down from the moment it is reported.
      if (input.severity === 'Critical') {
        equipment.status = 'OutOfService'
        d.downtimes.push({ id: newId(), equipmentId: equipment.id, startUtc: now, reason: PROBLEM_CATEGORY_LABELS[input.category] })
      }
      if (d.settings.notifyOnNewRequest) {
        notifyRole(d, 'Supervisor', 'New maintenance request', `${req.number} · ${equipment.name} · ${input.severity}`, '/supervisor/requests')
      }
      return req
    }),

  approve: (id, input) =>
    write((d) => {
      const user = authorize(d, 'request.review')
      const req = findOrThrow(d.requests, id, 'Request')
      if (req.status !== 'Submitted') throw new ApiError('conflict', `Request ${req.number} has already been ${req.status.toLowerCase()}.`)
      if (input.assigneeId) findOrThrow(d.users, input.assigneeId, 'Technician')
      const equipment = findOrThrow(d.equipment, req.equipmentId, 'Equipment')
      const now = nowIso()
      const wo: WorkOrder = {
        id: newId(),
        number: nextWorkOrderNumber(d),
        type: 'Corrective',
        title: `${PROBLEM_CATEGORY_LABELS[req.category]} — ${equipment.name}`,
        description: req.description + (req.additionalInfo ? `\n\n${req.additionalInfo}` : ''),
        equipmentId: req.equipmentId,
        requestId: req.id,
        priority: input.priority,
        status: input.assigneeId ? 'Assigned' : 'New',
        assigneeId: input.assigneeId,
        createdById: user.id,
        createdAtUtc: now,
        scheduledDate: input.scheduledDate,
        dueDate: dueDateForPriority(input.priority, d.settings.prioritySlaHours),
        instructions: 'Apply lockout/tagout before opening guards. Verify zero energy state. Inspect, diagnose and repair; record root cause and parts used.',
        checklist: [],
        laborHours: 0,
        partsRequired: [],
        partsUsed: [],
        attachments: req.attachments.map((a) => ({ ...a, id: newId() })),
      }
      d.workOrders.unshift(wo)
      for (const dt of d.downtimes) if (dt.equipmentId === wo.equipmentId && !dt.endUtc && !dt.workOrderId) dt.workOrderId = wo.id
      req.status = 'Approved'
      req.workOrderId = wo.id
      req.reviewedById = user.id
      req.reviewedAtUtc = now
      req.reviewNote = input.note?.trim() || undefined
      addLog(d, wo, user.id, 'Created', `Created from request ${req.number}`)
      if (wo.assigneeId) {
        addLog(d, wo, user.id, 'Assigned', `Assigned to ${userName(d, wo.assigneeId)}`)
        notifyUser(d, wo.assigneeId, 'New work order assigned', `${wo.number}: ${wo.title}`, `/tech/jobs/${wo.id}`)
      }
      notifyUser(d, req.requestedById, 'Request approved', `${req.number} is now work order ${wo.number}`, '/operator/requests')
      return { request: req, workOrder: wo }
    }),

  reject: (id, note) =>
    write((d) => {
      const user = authorize(d, 'request.review')
      const req = findOrThrow(d.requests, id, 'Request')
      if (req.status !== 'Submitted') throw new ApiError('conflict', `Request ${req.number} has already been ${req.status.toLowerCase()}.`)
      if (!note.trim()) throw new ApiError('validation', 'Give the requester a reason.')
      req.status = 'Rejected'
      req.reviewedById = user.id
      req.reviewedAtUtc = nowIso()
      req.reviewNote = note.trim()
      // A rejected report means the machine was not actually down.
      for (const dt of d.downtimes) if (dt.equipmentId === req.equipmentId && !dt.endUtc && !dt.workOrderId) dt.endUtc = req.reviewedAtUtc
      const e = d.equipment.find((x) => x.id === req.equipmentId)
      const openCorrective = d.workOrders.some((w) => w.equipmentId === req.equipmentId && w.type === 'Corrective' && !['Completed', 'Cancelled'].includes(w.status))
      if (e && e.status === 'OutOfService' && !openCorrective) e.status = 'Operational'
      notifyUser(d, req.requestedById, 'Request not approved', `${req.number}: ${req.reviewNote}`, '/operator/requests')
      return req
    }),
}
