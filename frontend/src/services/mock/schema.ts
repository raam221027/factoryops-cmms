import type {
  Department,
  Equipment,
  EquipmentCategory,
  EquipmentDowntime,
  EquipmentLocation,
  Facility,
  InventoryTransaction,
  MaintenanceRequest,
  Notification,
  Organization,
  PmSchedule,
  SparePart,
  SystemSettings,
  User,
  WorkLog,
  WorkOrder,
} from '@/domain/types'

/** Shape of the in-browser demo database. Bump DEMO_DB_VERSION when it changes. */
export const DEMO_DB_VERSION = 3

export interface DemoDb {
  version: number
  seededAtUtc: string
  counters: { workOrder: number; request: number }
  organizations: Organization[]
  facilities: Facility[]
  departments: Department[]
  locations: EquipmentLocation[]
  categories: EquipmentCategory[]
  equipment: Equipment[]
  users: User[]
  workOrders: WorkOrder[]
  workLogs: WorkLog[]
  requests: MaintenanceRequest[]
  pmSchedules: PmSchedule[]
  parts: SparePart[]
  transactions: InventoryTransaction[]
  downtimes: EquipmentDowntime[]
  notifications: Notification[]
  settings: SystemSettings
}
