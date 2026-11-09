/*
 * Enum values use the PascalCase member names of the backend C# enums, which is what
 * ASP.NET Core emits with JsonStringEnumConverter.
 */

export const ROLES = ['Admin', 'Supervisor', 'Technician', 'Operator'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<Role, string> = {
  Admin: 'Admin / Manager',
  Supervisor: 'Supervisor / Planner',
  Technician: 'Technician',
  Operator: 'Operator / Requester',
}

/** Mirrors FactoryOps.Domain.Enums.EquipmentStatus */
export const EQUIPMENT_STATUSES = ['Operational', 'UnderMaintenance', 'OutOfService', 'Retired'] as const
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number]

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  Operational: 'Operational',
  UnderMaintenance: 'Under maintenance',
  OutOfService: 'Out of service',
  Retired: 'Retired',
}

export const CRITICALITIES = ['Low', 'Medium', 'High'] as const
export type Criticality = (typeof CRITICALITIES)[number]

export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const
export type Priority = (typeof PRIORITIES)[number]

/**
 * Work order lifecycle:
 * New: needs triage. Pending: planned, waiting on parts or a schedule slot.
 * Assigned: technician set. InProgress: being worked. OnHold: paused.
 * Completed / Cancelled: closed.
 */
export const WORK_ORDER_STATUSES = ['New', 'Pending', 'Assigned', 'InProgress', 'OnHold', 'Completed', 'Cancelled'] as const
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number]

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  New: 'New',
  Pending: 'Pending',
  Assigned: 'Assigned',
  InProgress: 'In progress',
  OnHold: 'On hold',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
}

export const OPEN_WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = ['New', 'Pending', 'Assigned', 'InProgress', 'OnHold']

export const WORK_ORDER_TYPES = ['Corrective', 'Preventive'] as const
export type WorkOrderType = (typeof WORK_ORDER_TYPES)[number]

export const REQUEST_STATUSES = ['Submitted', 'Approved', 'Rejected'] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const PROBLEM_CATEGORIES = [
  'MachineNotStarting',
  'MechanicalFailure',
  'ElectricalProblem',
  'AbnormalNoise',
  'Overheating',
  'Leakage',
  'SensorMalfunction',
  'Other',
] as const
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number]

export const PROBLEM_CATEGORY_LABELS: Record<ProblemCategory, string> = {
  MachineNotStarting: 'Machine not starting',
  MechanicalFailure: 'Mechanical failure',
  ElectricalProblem: 'Electrical problem',
  AbnormalNoise: 'Abnormal noise',
  Overheating: 'Overheating',
  Leakage: 'Leakage',
  SensorMalfunction: 'Sensor malfunction',
  Other: 'Other',
}

export const FREQUENCY_UNITS = ['Day', 'Week', 'Month'] as const
export type FrequencyUnit = (typeof FREQUENCY_UNITS)[number]

export const ATTACHMENT_KINDS = ['Before', 'After', 'Problem', 'Document'] as const
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number]

export const WORK_LOG_ACTIONS = [
  'Created',
  'Approved',
  'Assigned',
  'Started',
  'Paused',
  'Resumed',
  'Completed',
  'Cancelled',
  'StatusChanged',
  'Note',
  'PartUsed',
  'PhotoAdded',
  'Updated',
] as const
export type WorkLogAction = (typeof WORK_LOG_ACTIONS)[number]

export const INVENTORY_TRANSACTION_TYPES = ['Receipt', 'Issue', 'Adjustment'] as const
export type InventoryTransactionType = (typeof INVENTORY_TRANSACTION_TYPES)[number]
