import type {
  AttachmentKind,
  EquipmentStatus,
  InventoryTransactionType,
  Priority,
  RequestStatus,
  Role,
  WorkOrderStatus,
  WorkOrderType,
} from '@/domain/enums'
import type {
  Attachment,
  Department,
  Equipment,
  EquipmentCategory,
  EquipmentDowntime,
  EquipmentLocation,
  Facility,
  Id,
  InventoryTransaction,
  IsoDate,
  MaintenanceRequest,
  Notification,
  Organization,
  PartLine,
  PmSchedule,
  SessionUser,
  SparePart,
  SystemSettings,
  User,
  WorkLog,
  WorkOrder,
} from '@/domain/types'

/*
 * Data access contracts. UI code depends only on these interfaces; the mock implementation
 * (services/mock) and the future HTTP implementation (services/api) both satisfy them.
 * The caller's identity comes from the session, exactly as an API derives it from the token.
 */

export interface OrganizationService {
  getOrganization(): Promise<Organization>
  updateOrganization(input: Omit<Organization, 'id' | 'createdAtUtc'>): Promise<Organization>
  listFacilities(): Promise<Facility[]>
  saveFacility(input: Omit<Facility, 'id' | 'organizationId'> & { id?: Id }): Promise<Facility>
  listDepartments(): Promise<Department[]>
  saveDepartment(input: Omit<Department, 'id'> & { id?: Id }): Promise<Department>
  listLocations(): Promise<EquipmentLocation[]>
  saveLocation(input: Omit<EquipmentLocation, 'id'> & { id?: Id }): Promise<EquipmentLocation>
  listCategories(): Promise<EquipmentCategory[]>
  saveCategory(input: Omit<EquipmentCategory, 'id'> & { id?: Id }): Promise<EquipmentCategory>
}

export interface EquipmentFilter {
  search?: string
  status?: EquipmentStatus
  categoryId?: Id
  departmentId?: Id
  locationId?: Id
}

export type EquipmentInput = Omit<Equipment, 'id' | 'organizationId' | 'createdAtUtc' | 'assetId'> & { assetId?: string }

export interface EquipmentService {
  list(filter?: EquipmentFilter): Promise<Equipment[]>
  get(id: Id): Promise<Equipment>
  /** Resolves a scanned or typed asset ID; returns null when unknown. */
  findByAssetId(assetId: string): Promise<Equipment | null>
  create(input: EquipmentInput): Promise<Equipment>
  update(id: Id, input: EquipmentInput): Promise<Equipment>
  /** Next free asset ID for a category, e.g. "CNC-009". */
  nextAssetId(categoryId: Id): Promise<string>
}

export interface UserFilter {
  search?: string
  role?: Role
  active?: boolean
}

export type UserInput = Omit<User, 'id' | 'organizationId' | 'createdAtUtc' | 'lastActiveAtUtc'>

export interface UserService {
  list(filter?: UserFilter): Promise<User[]>
  get(id: Id): Promise<User>
  create(input: UserInput): Promise<User>
  update(id: Id, input: UserInput): Promise<User>
  setActive(id: Id, active: boolean): Promise<User>
}

export interface WorkOrderFilter {
  search?: string
  status?: WorkOrderStatus | WorkOrderStatus[]
  type?: WorkOrderType
  priority?: Priority
  assigneeId?: Id
  equipmentId?: Id
  /** Only work orders assigned to the current user */
  mine?: boolean
}

export interface WorkOrderCreateInput {
  type: WorkOrderType
  title: string
  description: string
  equipmentId: Id
  priority: Priority
  assigneeId?: Id
  scheduledDate?: IsoDate
  dueDate?: IsoDate
  instructions?: string
  checklist?: string[]
  partsRequired?: PartLine[]
}

export type WorkOrderUpdateInput = Partial<Omit<WorkOrderCreateInput, 'type' | 'equipmentId' | 'checklist'>>

export interface CompleteWorkOrderInput {
  laborHours: number
  rootCause?: string
  actionsTaken: string
  note?: string
}

export interface NewAttachment {
  kind: AttachmentKind
  fileName: string
  url: string
}

export interface WorkOrderService {
  list(filter?: WorkOrderFilter): Promise<WorkOrder[]>
  get(id: Id): Promise<WorkOrder>
  logs(id: Id): Promise<WorkLog[]>
  create(input: WorkOrderCreateInput): Promise<WorkOrder>
  update(id: Id, input: WorkOrderUpdateInput): Promise<WorkOrder>
  assign(id: Id, assigneeId: Id | null): Promise<WorkOrder>
  /** Planning transitions (New/Pending/Assigned/Cancelled). Execution uses start/pause/resume/complete. */
  changeStatus(id: Id, status: WorkOrderStatus, note?: string): Promise<WorkOrder>
  start(id: Id): Promise<WorkOrder>
  pause(id: Id, reason: string): Promise<WorkOrder>
  resume(id: Id): Promise<WorkOrder>
  complete(id: Id, input: CompleteWorkOrderInput): Promise<WorkOrder>
  addNote(id: Id, text: string): Promise<WorkOrder>
  addAttachment(id: Id, attachment: NewAttachment): Promise<WorkOrder>
  removeAttachment(id: Id, attachmentId: Id): Promise<WorkOrder>
  recordPartUsage(id: Id, partId: Id, quantity: number): Promise<WorkOrder>
  setChecklistItem(id: Id, itemId: Id, done: boolean): Promise<WorkOrder>
}

export interface RequestFilter {
  status?: RequestStatus
  /** Only requests submitted by the current user */
  mine?: boolean
  equipmentId?: Id
}

export interface RequestCreateInput {
  equipmentId: Id
  category: MaintenanceRequest['category']
  severity: Priority
  description: string
  additionalInfo?: string
  attachments: NewAttachment[]
}

export interface ApproveRequestInput {
  priority: Priority
  assigneeId?: Id
  scheduledDate?: IsoDate
  note?: string
}

export interface RequestService {
  list(filter?: RequestFilter): Promise<MaintenanceRequest[]>
  get(id: Id): Promise<MaintenanceRequest>
  create(input: RequestCreateInput): Promise<MaintenanceRequest>
  approve(id: Id, input: ApproveRequestInput): Promise<{ request: MaintenanceRequest; workOrder: WorkOrder }>
  reject(id: Id, note: string): Promise<MaintenanceRequest>
}

export type PmScheduleInput = Omit<PmSchedule, 'id' | 'lastCompletedDate'>

export interface PmService {
  list(): Promise<PmSchedule[]>
  get(id: Id): Promise<PmSchedule>
  create(input: PmScheduleInput): Promise<PmSchedule>
  update(id: Id, input: PmScheduleInput): Promise<PmSchedule>
  /** Creates the work order for the schedule's next due date (if not already open). */
  generateWorkOrder(id: Id): Promise<WorkOrder>
}

export type SparePartInput = Omit<SparePart, 'id' | 'quantityOnHand'> & { quantityOnHand?: number }

export interface InventoryService {
  listParts(): Promise<SparePart[]>
  savePart(input: SparePartInput & { id?: Id }): Promise<SparePart>
  adjustStock(partId: Id, type: InventoryTransactionType, quantity: number, note?: string): Promise<SparePart>
  listTransactions(partId?: Id): Promise<InventoryTransaction[]>
}

export interface DowntimeService {
  list(): Promise<EquipmentDowntime[]>
}

export interface NotificationService {
  list(): Promise<Notification[]>
  markRead(id: Id): Promise<void>
  markAllRead(): Promise<void>
}

export interface SettingsService {
  get(): Promise<SystemSettings>
  update(input: Omit<SystemSettings, 'organizationId'>): Promise<SystemSettings>
}

export interface AttachmentsUploader {
  /** Turns a picked file into a storable attachment URL. */
  upload(file: File): Promise<Pick<Attachment, 'fileName' | 'url'>>
}

export interface AuthService {
  /** Restores a previous session, if any. */
  currentUser(): Promise<SessionUser | null>
  signIn(credentials: { email: string; password: string }): Promise<SessionUser>
  signOut(): Promise<void>
}

export interface DataServices {
  organization: OrganizationService
  equipment: EquipmentService
  users: UserService
  workOrders: WorkOrderService
  requests: RequestService
  pm: PmService
  inventory: InventoryService
  downtime: DowntimeService
  notifications: NotificationService
  settings: SettingsService
  attachments: AttachmentsUploader
}
