import type {
  AttachmentKind,
  Criticality,
  EquipmentStatus,
  FrequencyUnit,
  InventoryTransactionType,
  Priority,
  ProblemCategory,
  RequestStatus,
  Role,
  WorkLogAction,
  WorkOrderStatus,
  WorkOrderType,
} from './enums'

/** ISO-8601 UTC timestamp, e.g. "2026-11-09T08:30:00.000Z" */
export type IsoDateTime = string
/** Calendar date without time, e.g. "2026-11-09" */
export type IsoDate = string
/** GUID string (System.Guid on the backend) */
export type Id = string

export interface Organization {
  id: Id
  name: string
  code: string
  address: string
  timezone: string
  createdAtUtc: IsoDateTime
}

export interface Facility {
  id: Id
  organizationId: Id
  name: string
  code: string
  address: string
}

export interface Department {
  id: Id
  facilityId: Id
  name: string
  code: string
}

/** A production area or line inside a facility where equipment is installed. */
export interface EquipmentLocation {
  id: Id
  facilityId: Id
  departmentId: Id
  name: string
  code: string
}

export interface EquipmentCategory {
  id: Id
  name: string
  code: string
}

export interface Equipment {
  id: Id
  organizationId: Id
  assetId: string
  name: string
  serialNumber: string
  manufacturer?: string
  model?: string
  categoryId: Id
  departmentId: Id
  locationId: Id
  installationDate?: IsoDate
  warrantyExpiry?: IsoDate
  status: EquipmentStatus
  criticality: Criticality
  createdAtUtc: IsoDateTime
}

export interface User {
  id: Id
  organizationId: Id
  name: string
  email: string
  phone?: string
  role: Role
  title: string
  departmentId?: Id
  active: boolean
  /** Technicians: trade skills and certifications */
  skills: string[]
  /** Technicians: shift name */
  shift?: string
  createdAtUtc: IsoDateTime
  lastActiveAtUtc?: IsoDateTime
}

export interface Attachment {
  id: Id
  kind: AttachmentKind
  fileName: string
  /** Data URL in demo mode; a download URL once served by the API */
  url: string
  uploadedById: Id
  uploadedAtUtc: IsoDateTime
}

export interface WorkLog {
  id: Id
  workOrderId: Id
  userId: Id
  action: WorkLogAction
  message: string
  atUtc: IsoDateTime
}

export interface ChecklistItem {
  id: Id
  label: string
  done: boolean
}

export interface PartLine {
  partId: Id
  quantity: number
}

export interface WorkOrder {
  id: Id
  number: string
  type: WorkOrderType
  title: string
  description: string
  equipmentId: Id
  requestId?: Id
  pmScheduleId?: Id
  priority: Priority
  status: WorkOrderStatus
  assigneeId?: Id
  createdById: Id
  createdAtUtc: IsoDateTime
  scheduledDate?: IsoDate
  dueDate?: IsoDate
  startedAtUtc?: IsoDateTime
  completedAtUtc?: IsoDateTime
  instructions?: string
  checklist: ChecklistItem[]
  laborHours: number
  rootCause?: string
  actionsTaken?: string
  partsRequired: PartLine[]
  partsUsed: PartLine[]
  attachments: Attachment[]
  holdReason?: string
}

export interface MaintenanceRequest {
  id: Id
  number: string
  equipmentId: Id
  category: ProblemCategory
  severity: Priority
  description: string
  additionalInfo?: string
  attachments: Attachment[]
  requestedById: Id
  createdAtUtc: IsoDateTime
  status: RequestStatus
  workOrderId?: Id
  reviewedById?: Id
  reviewedAtUtc?: IsoDateTime
  reviewNote?: string
  /**
   * Read-only view of the resulting work order, projected by the server so requesters can
   * follow the repair without access to work orders themselves.
   */
  progress?: RequestProgress
}

export interface RequestProgress {
  workOrderNumber: string
  status: WorkOrderStatus
  technicianName?: string
  scheduledDate?: IsoDate
  startedAtUtc?: IsoDateTime
  completedAtUtc?: IsoDateTime
}

/** Open problem already known on a machine, shown to reporters to avoid duplicate reports. */
export interface ActiveIssue {
  kind: 'request' | 'workOrder'
  number: string
  summary: string
  status: RequestStatus | WorkOrderStatus
  sinceUtc: IsoDateTime
  reportedByMe: boolean
}

export interface PmSchedule {
  id: Id
  name: string
  equipmentId: Id
  frequencyInterval: number
  frequencyUnit: FrequencyUnit
  nextDueDate: IsoDate
  lastCompletedDate?: IsoDate
  checklist: string[]
  assigneeId?: Id
  estimatedHours: number
  priority: Priority
  active: boolean
}

export interface SparePart {
  id: Id
  partNumber: string
  name: string
  category: string
  unit: string
  quantityOnHand: number
  minimumStock: number
  unitCost: number
  storageLocation: string
}

export interface InventoryTransaction {
  id: Id
  partId: Id
  type: InventoryTransactionType
  /** Positive for receipts, negative for issues; adjustments may be either */
  quantity: number
  workOrderId?: Id
  userId: Id
  atUtc: IsoDateTime
  note?: string
}

export interface EquipmentDowntime {
  id: Id
  equipmentId: Id
  workOrderId?: Id
  startUtc: IsoDateTime
  endUtc?: IsoDateTime
  reason: string
}

export interface Notification {
  id: Id
  userId: Id
  title: string
  body: string
  link?: string
  atUtc: IsoDateTime
  read: boolean
}

export interface SystemSettings {
  organizationId: Id
  workOrderPrefix: string
  requestPrefix: string
  /** Target completion time in hours per priority, used to derive due dates */
  prioritySlaHours: Record<Priority, number>
  /** Blended technician labor cost per hour, for cost reporting */
  laborRatePerHour: number
  notifyOnNewRequest: boolean
  notifyOnAssignment: boolean
  notifyOnOverdue: boolean
  lowStockAlerts: boolean
}

/** The signed-in user as the frontend sees it. */
export interface SessionUser {
  id: Id
  name: string
  email: string
  role: Role
  title: string
  organizationId: Id
}
