import { describe, expect, it } from 'vitest'
import { toCsv } from '@/lib/csv'
import { assetIdFromScan } from '@/lib/dateRange'
import { formatElapsed } from '@/lib/format'
import { internalPath, safeAttachmentUrl } from '@/lib/url'
import { downtimeHours, mttrHours, pmCompliance } from './metrics'
import { hasPermission, ROLE_PERMISSIONS } from './permissions'
import { requestStage } from './requests'
import type { EquipmentDowntime, User, WorkOrder } from './types'
import { canTransition, compareByUrgency, isOnTodaysList, isOverdue, WORK_ORDER_TRANSITIONS } from './workOrderRules'
import { technicianWorkloads } from './workload'

const TODAY = new Date('2026-11-09T10:00:00Z')

function wo(overrides: Partial<WorkOrder> = {}): WorkOrder {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    number: 'WO-1',
    type: 'Corrective',
    title: 't',
    description: 'd',
    equipmentId: 'e1',
    priority: 'Medium',
    status: 'Assigned',
    createdById: 'u',
    createdAtUtc: '2026-11-01T08:00:00Z',
    checklist: [],
    laborHours: 0,
    partsRequired: [],
    partsUsed: [],
    attachments: [],
    ...overrides,
  }
}

describe('work order lifecycle', () => {
  it('closed work orders cannot move', () => {
    expect(WORK_ORDER_TRANSITIONS.Completed).toEqual([])
    expect(WORK_ORDER_TRANSITIONS.Cancelled).toEqual([])
  })

  it('work in progress can only be paused or completed', () => {
    expect(canTransition('InProgress', 'OnHold')).toBe(true)
    expect(canTransition('InProgress', 'Completed')).toBe(true)
    expect(canTransition('InProgress', 'Cancelled')).toBe(false)
    expect(canTransition('New', 'Completed')).toBe(false)
  })

  it('overdue means open and due before today', () => {
    expect(isOverdue(wo({ dueDate: '2026-11-08' }), TODAY)).toBe(true)
    expect(isOverdue(wo({ dueDate: '2026-11-09' }), TODAY)).toBe(false)
    expect(isOverdue(wo({ dueDate: '2026-11-01', status: 'Completed' }), TODAY)).toBe(false)
  })

  it("today's list uses the planned day before the due date", () => {
    expect(isOnTodaysList(wo({ scheduledDate: '2026-11-09', dueDate: '2026-11-20' }), TODAY)).toBe(true)
    expect(isOnTodaysList(wo({ scheduledDate: '2026-11-12', dueDate: '2026-11-20' }), TODAY)).toBe(false)
    expect(isOnTodaysList(wo({ dueDate: '2026-11-09' }), TODAY)).toBe(true)
    expect(isOnTodaysList(wo({ scheduledDate: '2026-11-09', status: 'Completed' }), TODAY)).toBe(false)
  })

  it('sorts overdue first, then by priority', () => {
    const list = [wo({ id: 'low', priority: 'Low', dueDate: '2099-01-01' }), wo({ id: 'crit', priority: 'Critical', dueDate: '2099-01-01' }), wo({ id: 'late', priority: 'Low', dueDate: '2020-01-01' })]
    expect(list.sort(compareByUrgency).map((w) => w.id)).toEqual(['late', 'crit', 'low'])
  })
})

describe('permissions', () => {
  it('only admins manage users, settings and equipment', () => {
    for (const p of ['user.manage', 'settings.manage', 'equipment.manage', 'org.manage'] as const) {
      expect(hasPermission('Admin', p)).toBe(true)
      expect(hasPermission('Supervisor', p)).toBe(false)
      expect(hasPermission('Technician', p)).toBe(false)
      expect(hasPermission('Operator', p)).toBe(false)
    }
  })

  it('operators can only report and follow their own requests', () => {
    expect([...ROLE_PERMISSIONS.Operator].sort()).toEqual(['request.create', 'request.view.own'])
  })

  it('technicians execute but do not plan', () => {
    expect(hasPermission('Technician', 'workorder.execute')).toBe(true)
    expect(hasPermission('Technician', 'workorder.assign')).toBe(false)
    expect(hasPermission('Technician', 'workorder.view.all')).toBe(false)
  })
})

describe('metrics', () => {
  it('MTTR averages start-to-finish of completed corrective work', () => {
    const list = [
      wo({ status: 'Completed', startedAtUtc: '2026-11-01T08:00:00Z', completedAtUtc: '2026-11-01T10:00:00Z' }),
      wo({ status: 'Completed', startedAtUtc: '2026-11-02T08:00:00Z', completedAtUtc: '2026-11-02T12:00:00Z' }),
      wo({ status: 'Completed', type: 'Preventive', startedAtUtc: '2026-11-02T08:00:00Z', completedAtUtc: '2026-11-03T08:00:00Z' }),
    ]
    expect(mttrHours(list)).toBe(3)
    expect(mttrHours([])).toBeNull()
  })

  it('PM compliance counts on-time completions and ignores work due today', () => {
    const list = [
      wo({ type: 'Preventive', dueDate: '2026-11-05', status: 'Completed', completedAtUtc: '2026-11-04T09:00:00Z' }),
      wo({ type: 'Preventive', dueDate: '2026-11-05', status: 'Completed', completedAtUtc: '2026-11-07T09:00:00Z' }),
      wo({ type: 'Preventive', dueDate: '2026-11-06', status: 'Assigned' }),
      wo({ type: 'Preventive', dueDate: '2026-11-09', status: 'Assigned' }),
    ]
    expect(pmCompliance(list, undefined, TODAY)).toBeCloseTo(1 / 3)
  })

  it('downtime is clipped to the range and open stoppages run until now', () => {
    const d: EquipmentDowntime[] = [
      { id: '1', equipmentId: 'e', startUtc: '2026-11-08T22:00:00Z', endUtc: '2026-11-09T02:00:00Z', reason: 'r' },
      { id: '2', equipmentId: 'e', startUtc: '2026-11-09T08:00:00Z', reason: 'r' },
    ]
    const range = { from: new Date('2026-11-09T00:00:00Z'), to: new Date('2026-11-10T00:00:00Z') }
    expect(downtimeHours(d, range, TODAY)).toBe(4)
  })
})

describe('technician workload', () => {
  const tech = (id: string, active = true): User => ({ id, organizationId: 'o', name: id, email: `${id}@x`, role: 'Technician', title: '', active, skills: [], createdAtUtc: '' })

  it('summarises open work per active technician, busiest first', () => {
    const list = [
      wo({ assigneeId: 'a', status: 'InProgress' }),
      wo({ assigneeId: 'a', dueDate: '2026-11-01' }),
      wo({ assigneeId: 'b' }),
      wo({ assigneeId: 'a', status: 'Completed', completedAtUtc: '2026-11-08T10:00:00Z' }),
    ]
    const [first, second] = technicianWorkloads([tech('a'), tech('b'), tech('c', false)], list, TODAY)
    expect(first.technician.id).toBe('a')
    expect(first.open).toHaveLength(2)
    expect(first.overdue).toBe(1)
    expect(first.current?.status).toBe('InProgress')
    expect(first.completedLast7Days).toBe(1)
    expect(second.technician.id).toBe('b')
  })
})

describe('request stage for requesters', () => {
  it('follows the repair after approval', () => {
    expect(requestStage({ status: 'Submitted' }).key).toBe('review')
    expect(requestStage({ status: 'Rejected' }).open).toBe(false)
    expect(requestStage({ status: 'Approved', progress: { workOrderNumber: 'W', status: 'New' } }).key).toBe('approved')
    expect(requestStage({ status: 'Approved', progress: { workOrderNumber: 'W', status: 'Assigned' } }).key).toBe('scheduled')
    expect(requestStage({ status: 'Approved', progress: { workOrderNumber: 'W', status: 'InProgress' } }).key).toBe('repairing')
    expect(requestStage({ status: 'Approved', progress: { workOrderNumber: 'W', status: 'Completed' } })).toMatchObject({ key: 'fixed', open: false })
    expect(requestStage({ status: 'Approved', progress: { workOrderNumber: 'W', status: 'Cancelled' } }).open).toBe(false)
  })
})

describe('QR labels', () => {
  it('reads asset IDs from label URLs and plain codes', () => {
    expect(assetIdFromScan('https://cmms.example.com/equipment/CNC-003')).toBe('CNC-003')
    expect(assetIdFromScan('http://localhost:4173/equipment/PMP%2D001/')).toBe('PMP-001')
    expect(assetIdFromScan('  CNV-002 ')).toBe('CNV-002')
  })

  it('rejects anything else', () => {
    expect(assetIdFromScan('https://example.com/some/page')).toBeNull()
    expect(assetIdFromScan('WIFI:S:guest;T:WPA;P:secret;;')).toBeNull()
    expect(assetIdFromScan('')).toBeNull()
  })
})

describe('URL safety', () => {
  it('allows only raster images, blob and http(s) attachments', () => {
    expect(safeAttachmentUrl('data:image/jpeg;base64,AAAA')).toBeDefined()
    expect(safeAttachmentUrl('https://files.example.com/a.jpg')).toBeDefined()
    expect(safeAttachmentUrl('/api/files/1')).toBe('/api/files/1')
    expect(safeAttachmentUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeAttachmentUrl('data:image/svg+xml;base64,AAAA')).toBeUndefined()
    expect(safeAttachmentUrl('data:text/html,<script>')).toBeUndefined()
    expect(safeAttachmentUrl('//evil.example.com/x')).toBeUndefined()
  })

  it('notification links stay inside the app', () => {
    expect(internalPath('/tech/jobs/1')).toBe('/tech/jobs/1')
    expect(internalPath('https://evil.example.com')).toBeUndefined()
    expect(internalPath('//evil.example.com')).toBeUndefined()
    expect(internalPath('/\\evil.example.com')).toBeUndefined()
    expect(internalPath(undefined)).toBeUndefined()
  })
})

describe('CSV export', () => {
  it('neutralises spreadsheet formulas, keeps numbers and escapes quotes', () => {
    const csv = toCsv([{ a: '=HYPERLINK("x")', b: 'say "hi"', c: '+cmd|calc', d: '-2' }], [
      { header: 'A', value: (r) => r.a },
      { header: 'B', value: (r) => r.b },
      { header: 'C', value: (r) => r.c },
      { header: 'D', value: (r) => r.d },
    ])
    const row = csv.split(/\r?\n/)[1]
    expect(row).toContain(`"'=HYPERLINK(""x"")"`)
    expect(row).toContain(`"say ""hi"""`)
    expect(row).toContain(`'+cmd|calc`)
    // plain numbers stay numbers
    expect(row.endsWith(',-2')).toBe(true)
  })
})

describe('formatting', () => {
  it('formats running time', () => {
    const now = new Date('2026-11-09T12:00:00Z')
    expect(formatElapsed('2026-11-09T11:15:00Z', now)).toBe('45 min')
    expect(formatElapsed('2026-11-09T09:50:00Z', now)).toBe('2 h 10 min')
    expect(formatElapsed('2026-11-06T08:00:00Z', now)).toBe('3 d 4 h')
  })
})
