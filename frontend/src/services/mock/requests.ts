import { hasPermission } from '@/domain/permissions'
import type { ActiveIssue, MaintenanceRequest, WorkOrder } from '@/domain/types'
import { dueDateForPriority, isOpen } from '@/domain/workOrderRules'
import { newId } from '@/lib/id'
import { PROBLEM_CATEGORY_LABELS } from '@/domain/enums'
import type { RequestService } from '../contracts'
import { ApiError } from '../errors'
import { addLog, nextRequestNumber, nextWorkOrderNumber, notifyAssignment, notifyRole, notifyUser, nowIso, userName } from './effects'
import type { DemoDb } from './schema'
import { actor, authorize, findOrThrow, read, write } from './store'

/** Attaches the progress of the resulting work order, as the API would project it. */
function withProgress(d: DemoDb, req: MaintenanceRequest): MaintenanceRequest {
  const wo = req.workOrderId ? d.workOrders.find((w) => w.id === req.workOrderId) : undefined
  if (!wo) return req
  return {
    ...req,
    progress: {
      workOrderNumber: wo.number,
      status: wo.status,
      technicianName: wo.assigneeId ? userName(d, wo.assigneeId) : undefined,
      scheduledDate: wo.scheduledDate,
      startedAtUtc: wo.startedAtUtc,
      completedAtUtc: wo.completedAtUtc,
    },
  }
}

/** Requester notifications deep-link into the requester's own app. */
function requestLink(d: DemoDb, req: MaintenanceRequest): string | undefined {
  return d.users.find((u) => u.id === req.requestedById)?.role === 'Operator' ? `/operator/requests/${req.id}` : undefined
}

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
      }).map((r) => withProgress(d, r))
    }),

  get: (id) =>
    read((d) => {
      const user = actor(d)
      const req = findOrThrow(d.requests, id, 'Request')
      if (!hasPermission(user.role, 'request.review') && req.requestedById !== user.id) {
        throw new ApiError('forbidden', 'You can only view your own requests.')
      }
      return withProgress(d, req)
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
        notifyRole(d, 'Supervisor', 'New maintenance request', `${req.number} · ${equipment.name} · ${input.severity}`, `/supervisor/requests?id=${req.id}`)
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
        notifyAssignment(d, wo, wo.assigneeId)
      }
      notifyUser(d, req.requestedById, 'Request approved', `${req.number} is now work order ${wo.number}`, requestLink(d, req))
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
      notifyUser(d, req.requestedById, 'Request not approved', `${req.number}: ${req.reviewNote}`, requestLink(d, req))
      return req
    }),

  activeIssues: (equipmentId) =>
    read((d) => {
      const user = authorize(d, 'request.create')
      findOrThrow(d.equipment, equipmentId, 'Equipment')
      const issues: ActiveIssue[] = [
        ...d.requests
          .filter((r) => r.equipmentId === equipmentId && r.status === 'Submitted')
          .map((r) => ({ kind: 'request' as const, number: r.number, summary: PROBLEM_CATEGORY_LABELS[r.category], status: r.status, sinceUtc: r.createdAtUtc, reportedByMe: r.requestedById === user.id })),
        ...d.workOrders
          .filter((w) => w.equipmentId === equipmentId && w.type === 'Corrective' && isOpen(w))
          .map((w) => ({
            kind: 'workOrder' as const,
            number: w.number,
            summary: w.title,
            status: w.status,
            sinceUtc: w.createdAtUtc,
            reportedByMe: !!w.requestId && d.requests.some((r) => r.id === w.requestId && r.requestedById === user.id),
          })),
      ]
      return issues.sort((a, b) => b.sinceUtc.localeCompare(a.sinceUtc))
    }),
}
