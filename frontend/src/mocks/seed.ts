import { addDays, addHours, addMinutes, addMonths, addWeeks, parseISO, startOfDay, subDays } from 'date-fns'
import type { FrequencyUnit, Priority, ProblemCategory, Role, WorkLogAction, WorkOrderStatus } from '@/domain/enums'
import type {
  ChecklistItem,
  Department,
  Equipment,
  EquipmentCategory,
  EquipmentDowntime,
  EquipmentLocation,
  Facility,
  InventoryTransaction,
  MaintenanceRequest,
  Notification,
  PartLine,
  PmSchedule,
  SparePart,
  User,
  WorkLog,
  WorkOrder,
} from '@/domain/types'
import { toIsoDate } from '@/domain/workOrderRules'
import { DEMO_DB_VERSION, type DemoDb } from '@/services/mock/schema'
import { DEMO_PRIMARY_TECHNICIAN_EMAIL } from './demoAccounts'

/*
 * Generates a realistic, internally consistent demo dataset. A fixed PRNG seed keeps the data
 * stable; dates are relative to `now` so the demo always shows current work.
 */

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createSeed(now: Date = new Date()): DemoDb {
  const rand = mulberry32(20261109)
  const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!
  const chance = (p: number) => rand() < p
  const weighted = <T,>(entries: [T, number][]): T => {
    let r = rand() * entries.reduce((s, [, w]) => s + w, 0)
    for (const [value, w] of entries) if ((r -= w) <= 0) return value
    return entries[entries.length - 1]![0]
  }
  const id = () => {
    const h = Array.from({ length: 32 }, () => Math.floor(rand() * 16).toString(16)).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20)}`
  }
  const iso = (d: Date) => d.toISOString()
  const today = startOfDay(now)
  const seededAt = subDays(today, 400)

  // ── Organization structure ────────────────────────────────────────────────
  const orgId = id()
  const organizations = [
    {
      id: orgId,
      name: 'Northwind Precision Manufacturing',
      code: 'NPM',
      address: '1200 Industrial Parkway, Riverside',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      createdAtUtc: iso(seededAt),
    },
  ]

  const plant1: Facility = { id: id(), organizationId: orgId, name: 'Plant 1 — Machining & Assembly', code: 'P1', address: '1200 Industrial Parkway' }
  const plant2: Facility = { id: id(), organizationId: orgId, name: 'Plant 2 — Fabrication & Packaging', code: 'P2', address: '1240 Industrial Parkway' }
  const facilities = [plant1, plant2]

  const dept = (facility: Facility, name: string, code: string): Department => ({ id: id(), facilityId: facility.id, name, code })
  const machining = dept(plant1, 'Machining', 'MCH')
  const assembly = dept(plant1, 'Assembly', 'ASM')
  const utilities = dept(plant1, 'Utilities', 'UTL')
  const fabrication = dept(plant2, 'Fabrication', 'FAB')
  const packaging = dept(plant2, 'Packaging', 'PKG')
  const molding = dept(plant2, 'Molding', 'MLD')
  const maintenanceDept = dept(plant1, 'Maintenance', 'MNT')
  const departments = [machining, assembly, utilities, fabrication, packaging, molding, maintenanceDept]

  const loc = (d: Department, name: string, code: string): EquipmentLocation => ({ id: id(), facilityId: d.facilityId, departmentId: d.id, name, code })
  const cncA = loc(machining, 'CNC Cell A', 'P1-CNC-A')
  const cncB = loc(machining, 'CNC Cell B', 'P1-CNC-B')
  const asm1 = loc(assembly, 'Assembly Line 1', 'P1-AL1')
  const asm2 = loc(assembly, 'Assembly Line 2', 'P1-AL2')
  const compRoom = loc(utilities, 'Compressor Room', 'P1-CMP')
  const boilerHouse = loc(utilities, 'Boiler House', 'P1-BLR')
  const pressShop = loc(fabrication, 'Press Shop', 'P2-PRS')
  const weldBay = loc(fabrication, 'Weld Bay', 'P2-WLD')
  const pack1 = loc(packaging, 'Packaging Line 1', 'P2-PK1')
  const pack2 = loc(packaging, 'Packaging Line 2', 'P2-PK2')
  const moldHall = loc(molding, 'Molding Hall', 'P2-MLD')
  const locations = [cncA, cncB, asm1, asm2, compRoom, boilerHouse, pressShop, weldBay, pack1, pack2, moldHall]

  const cat = (name: string, code: string): EquipmentCategory => ({ id: id(), name, code })
  const categories = {
    cnc: cat('CNC Machine', 'CNC'),
    press: cat('Hydraulic Press', 'PRS'),
    conveyor: cat('Conveyor', 'CNV'),
    compressor: cat('Air Compressor', 'CMP'),
    pump: cat('Pump', 'PMP'),
    packaging: cat('Packaging Machine', 'PKG'),
    robot: cat('Industrial Robot', 'ROB'),
    boiler: cat('Boiler', 'BLR'),
    hvac: cat('HVAC', 'HVC'),
    molding: cat('Injection Molding', 'IMM'),
  }

  // ── Equipment ─────────────────────────────────────────────────────────────
  type Template = {
    category: EquipmentCategory
    name: string
    manufacturer: string
    model: string
    locations: EquipmentLocation[]
    count: number
    criticality: Equipment['criticality']
  }
  const templates: Template[] = [
    { category: categories.cnc, name: 'Vertical Machining Center', manufacturer: 'Haas', model: 'VF-2SS', locations: [cncA, cncB], count: 5, criticality: 'High' },
    { category: categories.cnc, name: 'CNC Turning Center', manufacturer: 'Mazak', model: 'QT-250MY', locations: [cncA, cncB], count: 3, criticality: 'High' },
    { category: categories.press, name: 'Hydraulic Press 200T', manufacturer: 'Schuler', model: 'HPX-200', locations: [pressShop], count: 3, criticality: 'High' },
    { category: categories.conveyor, name: 'Belt Conveyor', manufacturer: 'Interroll', model: 'BM 8320', locations: [asm1, asm2, pack1, pack2], count: 6, criticality: 'Medium' },
    { category: categories.compressor, name: 'Rotary Screw Compressor', manufacturer: 'Atlas Copco', model: 'GA37 VSD+', locations: [compRoom], count: 2, criticality: 'High' },
    { category: categories.pump, name: 'Centrifugal Coolant Pump', manufacturer: 'Grundfos', model: 'NB 50-200', locations: [cncA, cncB, boilerHouse], count: 4, criticality: 'Medium' },
    { category: categories.packaging, name: 'Carton Sealer', manufacturer: '3M-Matic', model: '8000a3', locations: [pack1, pack2], count: 2, criticality: 'Medium' },
    { category: categories.packaging, name: 'Stretch Wrapper', manufacturer: 'Lantech', model: 'Q-300', locations: [pack1, pack2], count: 2, criticality: 'Low' },
    { category: categories.robot, name: 'Arc Welding Robot', manufacturer: 'FANUC', model: 'ARC Mate 100iD', locations: [weldBay], count: 3, criticality: 'High' },
    { category: categories.robot, name: 'Assembly Robot', manufacturer: 'ABB', model: 'IRB 1300', locations: [asm1, asm2], count: 2, criticality: 'Medium' },
    { category: categories.boiler, name: 'Steam Boiler', manufacturer: 'Cleaver-Brooks', model: 'CBEX Elite 100', locations: [boilerHouse], count: 1, criticality: 'High' },
    { category: categories.hvac, name: 'Air Handling Unit', manufacturer: 'Carrier', model: '39M', locations: [asm1, moldHall, compRoom], count: 3, criticality: 'Low' },
    { category: categories.molding, name: 'Injection Molding Machine', manufacturer: 'Engel', model: 'victory 200', locations: [moldHall], count: 4, criticality: 'High' },
  ]
  const deptOfLocation = new Map(locations.map((l) => [l.id, l.departmentId]))
  const assetSeq = new Map<string, number>()
  const equipment: Equipment[] = []
  for (const t of templates) {
    for (let i = 0; i < t.count; i++) {
      const seq = (assetSeq.get(t.category.code) ?? 0) + 1
      assetSeq.set(t.category.code, seq)
      const location = t.locations[i % t.locations.length]!
      const installed = subDays(today, int(400, 3200))
      equipment.push({
        id: id(),
        organizationId: orgId,
        assetId: `${t.category.code}-${String(seq).padStart(3, '0')}`,
        name: t.count > 1 ? `${t.name} #${i + 1}` : t.name,
        serialNumber: `${t.manufacturer.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase()}${int(100000, 999999)}`,
        manufacturer: t.manufacturer,
        model: t.model,
        categoryId: t.category.id,
        departmentId: deptOfLocation.get(location.id)!,
        locationId: location.id,
        installationDate: toIsoDate(installed),
        warrantyExpiry: toIsoDate(addDays(installed, 365 * int(2, 5))),
        status: 'Operational',
        criticality: t.criticality,
        createdAtUtc: iso(seededAt),
      })
    }
  }
  // Two retired machines for realism
  equipment[equipment.length - 1]!.status = 'Retired'
  equipment[13]!.status = 'Retired'
  const activeEquipment = equipment.filter((e) => e.status !== 'Retired')
  const categoryCodeOf = (e: Equipment) => Object.values(categories).find((c) => c.id === e.categoryId)!.code

  // ── Users ─────────────────────────────────────────────────────────────────
  const user = (name: string, role: Role, title: string, departmentId: string | undefined, extra: Partial<User> = {}): User => ({
    id: id(),
    organizationId: orgId,
    name,
    email: `${name.toLowerCase().replace(/[^a-z ]/g, '').split(' ').join('.')}@northwind.example`,
    phone: `+1 555 01${int(10, 99)}`,
    role,
    title,
    departmentId,
    active: true,
    skills: [],
    createdAtUtc: iso(addDays(seededAt, int(0, 60))),
    lastActiveAtUtc: iso(subDays(now, int(0, 3))),
    ...extra,
  })
  const admin = user('Elena Petrova', 'Admin', 'Plant Maintenance Manager', maintenanceDept.id)
  const admin2 = user('James Whitfield', 'Admin', 'Reliability Engineer', maintenanceDept.id)
  const supervisor = user('Robert Hayes', 'Supervisor', 'Maintenance Supervisor', maintenanceDept.id)
  const planner = user('Priya Nair', 'Supervisor', 'Maintenance Planner', maintenanceDept.id)
  const technicians = [
    user('Daniel Reyes', 'Technician', 'Maintenance Technician II', maintenanceDept.id, { skills: ['Mechanical', 'Hydraulics', 'CNC'], shift: 'Day shift' }),
    user('Aisha Khan', 'Technician', 'Electrical Technician', maintenanceDept.id, { skills: ['Electrical', 'PLC', 'Sensors'], shift: 'Day shift' }),
    user('Marco Bianchi', 'Technician', 'Maintenance Technician I', maintenanceDept.id, { skills: ['Mechanical', 'Pneumatics'], shift: 'Day shift' }),
    user("Liam O'Connor", 'Technician', 'Robotics Technician', maintenanceDept.id, { skills: ['Robotics', 'Electrical', 'Welding'], shift: 'Night shift' }),
    user('Grace Tan', 'Technician', 'Utilities Technician', maintenanceDept.id, { skills: ['HVAC', 'Boilers', 'Compressors'], shift: 'Day shift' }),
    user('Samuel Okafor', 'Technician', 'Maintenance Technician II', maintenanceDept.id, { skills: ['Mechanical', 'Lubrication', 'Vibration analysis'], shift: 'Night shift' }),
  ]
  technicians[0]!.email = DEMO_PRIMARY_TECHNICIAN_EMAIL
  const operators = [
    user('Carlos Mendoza', 'Operator', 'Machine Operator', machining.id),
    user('Hannah Weber', 'Operator', 'Line Lead', assembly.id),
    user('Kenji Sato', 'Operator', 'Press Operator', fabrication.id),
    user('Fatima Diallo', 'Operator', 'Packaging Operator', packaging.id),
  ]
  const inactive = user('Tom Becker', 'Technician', 'Maintenance Technician I', maintenanceDept.id, { active: false, skills: ['Mechanical'] })
  const users = [admin, admin2, supervisor, planner, ...technicians, ...operators, inactive]
  const primaryTech = technicians[0]!

  // ── Spare parts ───────────────────────────────────────────────────────────
  const partDefs: [string, string, string, number, number, number][] = [
    // name, category, unit, unitCost, min, onHand
    ['Deep groove ball bearing 6205-2RS', 'Bearings', 'pcs', 9, 20, 46],
    ['Spherical roller bearing 22212', 'Bearings', 'pcs', 145, 4, 3],
    ['V-belt SPA 1250', 'Belts', 'pcs', 18, 10, 24],
    ['Conveyor belt splice kit', 'Belts', 'kit', 85, 3, 5],
    ['Hydraulic oil ISO VG 46 (20 L)', 'Lubricants', 'pail', 92, 6, 11],
    ['Way oil ISO VG 68 (20 L)', 'Lubricants', 'pail', 88, 4, 2],
    ['Lithium grease EP2 (400 g)', 'Lubricants', 'cartridge', 7, 24, 60],
    ['Hydraulic filter element 10 µm', 'Filters', 'pcs', 64, 6, 9],
    ['Compressor air/oil separator', 'Filters', 'pcs', 210, 2, 2],
    ['Compressor intake air filter', 'Filters', 'pcs', 48, 4, 7],
    ['AHU panel filter G4 592×592', 'Filters', 'pcs', 14, 20, 32],
    ['Proximity sensor M18 PNP', 'Electrical', 'pcs', 39, 8, 5],
    ['Contactor 3-pole 32 A', 'Electrical', 'pcs', 56, 4, 6],
    ['Motor 2.2 kW 4-pole IE3', 'Electrical', 'pcs', 420, 1, 2],
    ['Servo drive fuse 10 A', 'Electrical', 'pcs', 6, 20, 14],
    ['Hydraulic cylinder seal kit', 'Seals', 'kit', 120, 3, 4],
    ['Mechanical seal 35 mm', 'Seals', 'pcs', 165, 2, 1],
    ['O-ring kit (metric assortment)', 'Seals', 'kit', 45, 2, 3],
    ['Welding contact tip 1.2 mm', 'Welding', 'pcs', 2, 100, 240],
    ['Welding torch nozzle', 'Welding', 'pcs', 11, 20, 18],
    ['Carton sealer cutter blade', 'Packaging', 'pcs', 26, 6, 10],
    ['Stretch film pre-stretch roller', 'Packaging', 'pcs', 310, 1, 1],
    ['Injection screw check ring', 'Molding', 'pcs', 380, 1, 2],
    ['Heater band 250 W', 'Molding', 'pcs', 74, 6, 8],
    ['Coolant concentrate (20 L)', 'Lubricants', 'pail', 110, 4, 6],
  ]
  const parts: SparePart[] = partDefs.map(([name, category, unit, unitCost, minimumStock, quantityOnHand], i) => ({
    id: id(),
    partNumber: `SP-${String(1001 + i)}`,
    name,
    category,
    unit,
    unitCost,
    minimumStock,
    quantityOnHand,
    storageLocation: `Store ${pick(['A', 'B'])}-${int(1, 12)}-${int(1, 5)}`,
  }))
  const partsByCategory = (...cats: string[]) => parts.filter((p) => cats.includes(p.category))
  const relevantParts: Record<string, SparePart[]> = {
    CNC: partsByCategory('Bearings', 'Lubricants', 'Electrical', 'Filters'),
    PRS: partsByCategory('Seals', 'Filters', 'Lubricants'),
    CNV: partsByCategory('Belts', 'Bearings', 'Electrical'),
    CMP: partsByCategory('Filters', 'Lubricants', 'Electrical'),
    PMP: partsByCategory('Seals', 'Bearings', 'Electrical'),
    PKG: partsByCategory('Packaging', 'Electrical', 'Belts'),
    ROB: partsByCategory('Welding', 'Electrical'),
    BLR: partsByCategory('Seals', 'Electrical'),
    HVC: partsByCategory('Filters', 'Belts', 'Electrical'),
    IMM: partsByCategory('Molding', 'Seals', 'Electrical'),
  }

  // ── Problem library for corrective work ──────────────────────────────────
  type Problem = { category: ProblemCategory; title: string; description: string; rootCause: string; action: string; appliesTo?: string[] }
  const problems: Problem[] = [
    { category: 'AbnormalNoise', title: 'Grinding noise from spindle', description: 'Loud grinding noise from the spindle at higher RPM. Started during the last shift.', rootCause: 'Worn spindle bearing due to lubrication starvation.', action: 'Replaced bearing, flushed and refilled lubrication, verified runout.', appliesTo: ['CNC'] },
    { category: 'Leakage', title: 'Hydraulic oil leak under unit', description: 'Pool of hydraulic oil under the power unit. Level dropping in the reservoir.', rootCause: 'Cylinder rod seal failure.', action: 'Replaced seal kit, topped up oil, pressure tested at working pressure.', appliesTo: ['PRS', 'IMM'] },
    { category: 'MachineNotStarting', title: 'Machine will not start', description: 'Machine shows no response when cycle start is pressed. Control panel is on.', rootCause: 'Tripped overload relay on main drive motor.', action: 'Reset overload, checked motor current and insulation, adjusted relay setting.' },
    { category: 'ElectricalProblem', title: 'Intermittent E-stop fault', description: 'Machine stops randomly with an E-stop circuit fault even though no button is pressed.', rootCause: 'Loose terminal in E-stop safety relay circuit.', action: 'Re-terminated wiring, tested all E-stop channels.' },
    { category: 'Overheating', title: 'Motor overheating', description: 'Drive motor housing very hot to touch, burning smell reported.', rootCause: 'Blocked cooling fan cover and clogged fins.', action: 'Cleaned fan cover and fins, verified current draw within rating.', appliesTo: ['CNV', 'PMP', 'PKG', 'HVC', 'CMP'] },
    { category: 'SensorMalfunction', title: 'Part-present sensor not detecting', description: 'Station stops waiting for part even when the part is in position.', rootCause: 'Damaged proximity sensor cable.', action: 'Replaced proximity sensor and cable, adjusted sensing distance.', appliesTo: ['CNV', 'PKG', 'ROB', 'CNC'] },
    { category: 'MechanicalFailure', title: 'Conveyor belt slipping', description: 'Belt slips under load, products bunching up at transfer point.', rootCause: 'Belt stretched and drive pulley lagging worn.', action: 'Re-tensioned belt, replaced lagging, aligned tracking.', appliesTo: ['CNV'] },
    { category: 'MechanicalFailure', title: 'Broken drive belt', description: 'Drive belt snapped, machine stopped mid-cycle.', rootCause: 'Belt reached end of life; misalignment accelerated wear.', action: 'Replaced V-belts as a set and aligned pulleys.', appliesTo: ['HVC', 'CNV', 'PKG'] },
    { category: 'AbnormalNoise', title: 'Excessive vibration', description: 'Unit vibrating more than usual, noticeable at the base frame.', rootCause: 'Loose foundation bolts and imbalance.', action: 'Torqued foundation bolts, balanced impeller.', appliesTo: ['PMP', 'HVC', 'CMP', 'CNC'] },
    { category: 'Leakage', title: 'Coolant leak at pump seal', description: 'Coolant dripping from pump shaft area.', rootCause: 'Mechanical seal faces worn.', action: 'Replaced mechanical seal, checked shaft for scoring.', appliesTo: ['PMP'] },
    { category: 'Overheating', title: 'Compressor high temperature alarm', description: 'Compressor tripped on high discharge temperature alarm.', rootCause: 'Clogged cooler and low oil level.', action: 'Cleaned cooler, replaced separator, topped up oil.', appliesTo: ['CMP'] },
    { category: 'ElectricalProblem', title: 'Heater zone not reaching temperature', description: 'Barrel zone 3 stays below setpoint, parts showing short shots.', rootCause: 'Failed heater band.', action: 'Replaced heater band and thermocouple connector.', appliesTo: ['IMM'] },
    { category: 'MechanicalFailure', title: 'Sealer not cutting tape', description: 'Tape is not cut cleanly at the end of the carton.', rootCause: 'Dull cutter blade.', action: 'Replaced cutter blade and adjusted spring tension.', appliesTo: ['PKG'] },
    { category: 'SensorMalfunction', title: 'Robot collision detection false trips', description: 'Robot stops with collision detection alarm with no contact.', rootCause: 'Payload settings wrong after tooling change.', action: 'Corrected payload data, re-mastered axis 4.', appliesTo: ['ROB'] },
    { category: 'Other', title: 'Guard door interlock damaged', description: 'Guard door interlock bracket bent; door can be opened while running.', rootCause: 'Impact from forklift.', action: 'Replaced bracket and interlock switch, tested safety function.', appliesTo: ['CNC', 'PRS', 'ROB', 'IMM'] },
  ]
  /** A failure mode that makes sense for this kind of machine. */
  const problemFor = (e: Equipment) => pick(problems.filter((p) => !p.appliesTo || p.appliesTo.includes(categoryCodeOf(e))))

  const pmChecklists: Record<string, string[]> = {
    CNC: ['Check way oil level and refill', 'Clean chip conveyor and coolant tank screen', 'Inspect spindle for runout and noise', 'Check axis lubrication lines', 'Verify coolant concentration (refractometer)'],
    PRS: ['Inspect hydraulic hoses and fittings for leaks', 'Check oil level and temperature', 'Replace hydraulic filter if indicator red', 'Test light curtain and two-hand control', 'Check ram guide clearances'],
    CNV: ['Check belt tension and tracking', 'Lubricate bearings', 'Inspect rollers for wear', 'Check emergency pull-cord function'],
    CMP: ['Check oil level', 'Inspect intake filter', 'Drain condensate', 'Record discharge pressure and temperature', 'Check for air leaks'],
    PMP: ['Inspect seal for leakage', 'Check motor vibration', 'Lubricate motor bearings', 'Verify flow and pressure'],
    PKG: ['Inspect cutter blade', 'Clean tape heads', 'Check drive belts', 'Test safety guards'],
    ROB: ['Check cable dress pack for wear', 'Clean and inspect torch', 'Back up robot program', 'Check axis grease levels'],
    BLR: ['Test low-water cutoff', 'Check burner flame', 'Blow down boiler', 'Inspect safety valves', 'Record stack temperature'],
    HVC: ['Replace panel filters', 'Check fan belt tension', 'Clean coil fins', 'Check drain pan'],
    IMM: ['Check hydraulic oil level', 'Inspect heater bands', 'Grease toggle mechanism', 'Check mold clamp safety', 'Clean hopper and dryer'],
  }

  // ── Preventive maintenance schedules ─────────────────────────────────────
  const pmTargets = activeEquipment.filter((e) => e.criticality !== 'Low' || chance(0.4)).slice(0, 18)
  const freqFor = (code: string): [number, FrequencyUnit] =>
    ({ CNC: [1, 'Month'], PRS: [1, 'Month'], CNV: [2, 'Week'], CMP: [3, 'Month'], PMP: [1, 'Month'], PKG: [2, 'Week'], ROB: [1, 'Month'], BLR: [1, 'Week'], HVC: [3, 'Month'], IMM: [1, 'Month'] })[code] as [number, FrequencyUnit]
  const addFrequency = (d: Date, n: number, unit: FrequencyUnit) => (unit === 'Day' ? addDays(d, n) : unit === 'Week' ? addWeeks(d, n) : addMonths(d, n))
  const pmSchedules: PmSchedule[] = pmTargets.map((e, i) => {
    const code = categoryCodeOf(e)
    const [interval, unit] = freqFor(code)
    return {
      id: id(),
      name: `${interval === 1 ? unit === 'Week' ? 'Weekly' : 'Monthly' : `${interval}-${unit.toLowerCase()}`} PM — ${e.name}`,
      equipmentId: e.id,
      frequencyInterval: interval,
      frequencyUnit: unit,
      // A few schedules are slightly overdue; the rest are coming up.
      nextDueDate: toIsoDate(addDays(today, i % 6 === 0 ? int(-4, -1) : int(1, 21))),
      checklist: pmChecklists[code] ?? ['General inspection'],
      assigneeId: pick(technicians).id,
      estimatedHours: pick([1, 1.5, 2, 3, 4]),
      priority: e.criticality === 'High' ? 'High' : 'Medium',
      active: true,
    }
  })

  // ── Work orders, logs, downtime ──────────────────────────────────────────
  let woSeq = 10000
  let mrSeq = 2000
  const workOrders: WorkOrder[] = []
  const workLogs: WorkLog[] = []
  const requests: MaintenanceRequest[] = []
  const downtimes: EquipmentDowntime[] = []
  const transactions: InventoryTransaction[] = []
  const slaHours: Record<Priority, number> = { Critical: 8, High: 24, Medium: 72, Low: 168 }
  const supervisors = [supervisor, planner]

  const log = (wo: WorkOrder, userId: string, action: WorkLogAction, message: string, at: Date) =>
    workLogs.push({ id: id(), workOrderId: wo.id, userId, action, message, atUtc: iso(at) })

  const pickParts = (e: Equipment, max: number): PartLine[] => {
    const pool = relevantParts[categoryCodeOf(e)] ?? parts
    const n = int(0, max)
    const chosen = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      const p = pick(pool)
      chosen.set(p.id, (chosen.get(p.id) ?? 0) + int(1, 2))
    }
    return [...chosen].map(([partId, quantity]) => ({ partId, quantity }))
  }

  const checklistFrom = (labels: string[], done: boolean): ChecklistItem[] => labels.map((label) => ({ id: id(), label, done }))

  type Lifecycle = {
    status: WorkOrderStatus
    created: Date
    assigneeId?: string
    durationHours?: number
  }

  /** Builds a work order and the log/downtime/inventory records consistent with its status. */
  function buildWorkOrder(
    base: Pick<WorkOrder, 'type' | 'title' | 'description' | 'equipmentId' | 'priority'> & Partial<WorkOrder>,
    life: Lifecycle,
    problem?: Problem,
  ): WorkOrder {
    const e = equipment.find((x) => x.id === base.equipmentId)!
    const creator = base.createdById ?? pick(supervisors).id
    const due = base.dueDate ?? toIsoDate(addHours(life.created, slaHours[base.priority]))
    const assigned = life.status !== 'New' && life.status !== 'Pending' && life.status !== 'Cancelled'
    const assigneeId = assigned || (life.status === 'Pending' && chance(0.3)) ? (life.assigneeId ?? pick(technicians).id) : undefined
    const started = ['InProgress', 'OnHold', 'Completed'].includes(life.status) ? addMinutes(life.created, int(20, 300)) : undefined
    const completed = life.status === 'Completed' && started ? addMinutes(started, Math.round((life.durationHours ?? rand() * 6 + 0.5) * 60)) : undefined
    const used = life.status === 'Completed' || life.status === 'InProgress' ? pickParts(e, base.type === 'Corrective' ? 3 : 2) : []
    const wo: WorkOrder = {
      id: id(),
      number: `WO-${++woSeq}`,
      createdById: creator,
      createdAtUtc: iso(life.created),
      status: life.status,
      assigneeId,
      dueDate: due,
      scheduledDate: base.scheduledDate ?? (assigneeId ? toIsoDate(life.created) : undefined),
      startedAtUtc: started && iso(started),
      completedAtUtc: completed && iso(completed),
      checklist: [],
      laborHours: completed && started ? Math.round(((completed.getTime() - started.getTime()) / 36e5) * 10) / 10 : started ? Math.round(rand() * 20) / 10 : 0,
      rootCause: life.status === 'Completed' ? problem?.rootCause : undefined,
      actionsTaken: life.status === 'Completed' ? (problem?.action ?? 'Completed all checklist items. No abnormalities found.') : undefined,
      partsRequired: base.type === 'Corrective' && chance(0.5) ? pickParts(e, 2) : [],
      partsUsed: used,
      attachments: [],
      instructions:
        base.type === 'Corrective'
          ? 'Apply lockout/tagout before opening guards. Verify zero energy state. Inspect, diagnose and repair; record root cause and parts used.'
          : 'Follow the checklist. Apply lockout/tagout where required. Report any abnormal findings as a new work order.',
      ...base,
    }
    log(wo, creator, 'Created', 'Work order created', life.created)
    if (assigneeId) log(wo, creator, 'Assigned', `Assigned to ${users.find((u) => u.id === assigneeId)!.name}`, addMinutes(life.created, 10))
    if (started) log(wo, assigneeId!, 'Started', 'Work started', started)
    if (life.status === 'OnHold') log(wo, assigneeId!, 'Paused', wo.holdReason ?? 'Waiting for spare parts', addMinutes(started!, 45))
    if (completed) log(wo, assigneeId!, 'Completed', 'Work completed', completed)
    if (life.status === 'Cancelled') {
      const reason = base.type === 'Preventive' ? 'Skipped: production could not release the machine' : 'Duplicate request — cancelled'
      log(wo, creator, 'Cancelled', reason, addHours(life.created, 2))
    }
    for (const line of used) {
      transactions.push({ id: id(), partId: line.partId, type: 'Issue', quantity: -line.quantity, workOrderId: wo.id, userId: assigneeId!, atUtc: iso(completed ?? started ?? life.created), note: wo.number })
      log(wo, assigneeId!, 'PartUsed', `Used ${line.quantity} × ${parts.find((p) => p.id === line.partId)!.name}`, completed ?? started ?? life.created)
    }
    // Breakdowns of important machines cause downtime until the repair completes.
    if (base.type === 'Corrective' && (base.priority === 'Critical' || base.priority === 'High') && life.status !== 'Cancelled') {
      downtimes.push({
        id: id(),
        equipmentId: e.id,
        workOrderId: wo.id,
        startUtc: iso(life.created),
        endUtc: completed ? iso(completed) : undefined,
        reason: base.title,
      })
    }
    workOrders.push(wo)
    return wo
  }

  function buildRequest(wo: WorkOrder | undefined, e: Equipment, problem: Problem, severity: Priority, created: Date, status: MaintenanceRequest['status']) {
    const operator = operators.find((o) => o.departmentId === e.departmentId) ?? pick(operators)
    const reviewer = pick(supervisors)
    const req: MaintenanceRequest = {
      id: id(),
      number: `MR-${++mrSeq}`,
      equipmentId: e.id,
      category: problem.category,
      severity,
      description: problem.description,
      attachments: [],
      requestedById: operator.id,
      createdAtUtc: iso(created),
      status,
      workOrderId: wo?.id,
      reviewedById: status === 'Submitted' ? undefined : reviewer.id,
      reviewedAtUtc: status === 'Submitted' ? undefined : iso(addMinutes(created, int(10, 90))),
      reviewNote: status === 'Rejected' ? 'Not a fault — machine was in setup mode. Operator briefed.' : undefined,
    }
    requests.push(req)
    if (wo) {
      wo.requestId = req.id
      log(wo, reviewer.id, 'Approved', `Request ${req.number} approved`, addMinutes(created, 5))
    }
    return req
  }

  // Historical and current corrective work
  for (let i = 0; i < 90; i++) {
    const daysAgo = Math.floor(Math.pow(rand(), 1.3) * 180)
    const created = addMinutes(subDays(today, daysAgo), int(6 * 60, 20 * 60))
    if (created > now) continue
    const e = pick(activeEquipment)
    const problem = problemFor(e)
    const priority = weighted<Priority>([['Critical', 1], ['High', 3], ['Medium', 4], ['Low', 2]])
    const status: WorkOrderStatus =
      daysAgo > 6
        ? weighted<WorkOrderStatus>([['Completed', 94], ['Cancelled', 6]])
        : weighted<WorkOrderStatus>([['New', 2], ['Pending', 2], ['Assigned', 3], ['InProgress', 2], ['OnHold', 1], ['Completed', 4]])
    const wo = buildWorkOrder(
      { type: 'Corrective', title: `${problem.title} — ${e.name}`, description: problem.description, equipmentId: e.id, priority },
      { status, created, durationHours: rand() * (priority === 'Critical' ? 8 : 5) + 0.5 },
      problem,
    )
    if (chance(0.7)) buildRequest(wo, e, problem, priority, addMinutes(created, -int(5, 40)), 'Approved')
  }

  // Historical preventive work from PM schedules
  for (const s of pmSchedules) {
    const e = equipment.find((x) => x.id === s.equipmentId)!
    let due = addFrequency(parseISO(s.nextDueDate), -s.frequencyInterval, s.frequencyUnit)
    while (due >= today) due = addFrequency(due, -s.frequencyInterval, s.frequencyUnit)
    let lastCompleted: Date | undefined
    let mostRecent = true
    while (due > subDays(today, 180)) {
      // Only the latest cycle can still be open (overdue); older misses were skipped and cancelled.
      const missed = chance(0.06)
      const late = chance(0.12)
      const status: WorkOrderStatus = missed ? (mostRecent ? 'Assigned' : 'Cancelled') : 'Completed'
      mostRecent = false
      const wo = buildWorkOrder(
        {
          type: 'Preventive',
          title: s.name,
          description: `Scheduled preventive maintenance (${s.frequencyInterval} ${s.frequencyUnit.toLowerCase()} interval).`,
          equipmentId: e.id,
          priority: s.priority,
          pmScheduleId: s.id,
          dueDate: toIsoDate(due),
          scheduledDate: toIsoDate(due),
          checklist: checklistFrom(s.checklist, status === 'Completed'),
        },
        { status, created: late ? addDays(due, 1) : subDays(due, int(0, 3)), assigneeId: s.assigneeId, durationHours: s.estimatedHours * (0.8 + rand() * 0.5) },
      )
      if (status === 'Completed' && wo.completedAtUtc) lastCompleted ??= new Date(wo.completedAtUtc)
      due = addFrequency(due, -s.frequencyInterval, s.frequencyUnit)
    }
    if (lastCompleted) s.lastCompletedDate = toIsoDate(lastCompleted)
    // Upcoming PM due within the next week is already generated as a work order
    if (parseISO(s.nextDueDate) <= addDays(today, 7)) {
      buildWorkOrder(
        {
          type: 'Preventive',
          title: s.name,
          description: `Scheduled preventive maintenance (${s.frequencyInterval} ${s.frequencyUnit.toLowerCase()} interval).`,
          equipmentId: e.id,
          priority: s.priority,
          pmScheduleId: s.id,
          dueDate: s.nextDueDate,
          scheduledDate: s.nextDueDate,
          checklist: checklistFrom(s.checklist, false),
        },
        // Generated up to 5 days ahead of the due date, but never in the future
        { status: 'Assigned', created: new Date(Math.min(subDays(parseISO(s.nextDueDate), 5).getTime(), addHours(now, -3).getTime())), assigneeId: s.assigneeId },
      )
    }
  }

  // Guaranteed current workload for the primary demo technician
  const techJobs: [WorkOrderStatus, Priority, number, number][] = [
    // status, priority, created days ago, due offset days
    ['InProgress', 'High', 0, 1],
    ['Assigned', 'Critical', 0, 0],
    ['Assigned', 'Medium', 1, 0],
    ['Assigned', 'Low', 1, 3],
    ['Assigned', 'High', 4, -2],
    ['OnHold', 'Medium', 2, 2],
  ]
  for (const [status, priority, ago, dueOffset] of techJobs) {
    const e = pick(activeEquipment.filter((x) => ['CNC', 'PRS', 'CNV', 'PMP'].includes(categoryCodeOf(x))))
    const problem = problemFor(e)
    const created = addMinutes(subDays(today, ago), int(6 * 60, 9 * 60))
    const wo = buildWorkOrder(
      {
        type: 'Corrective',
        title: `${problem.title} — ${e.name}`,
        description: problem.description,
        equipmentId: e.id,
        priority,
        dueDate: toIsoDate(addDays(today, dueOffset)),
        scheduledDate: toIsoDate(addDays(today, Math.min(dueOffset, 0))),
        holdReason: status === 'OnHold' ? 'Waiting for spare parts' : undefined,
      },
      { status, created: created > now ? subDays(now, 0.05) : created, assigneeId: primaryTech.id },
      problem,
    )
    buildRequest(wo, e, problem, priority, addMinutes(new Date(wo.createdAtUtc), -15), 'Approved')
  }

  // Requests waiting for supervisor review, and a few rejected ones
  for (let i = 0; i < 6; i++) {
    const e = pick(activeEquipment)
    const problem = problemFor(e)
    buildRequest(undefined, e, problem, weighted<Priority>([['Critical', 1], ['High', 2], ['Medium', 3], ['Low', 1]]), subDays(now, rand() * 1.5), 'Submitted')
  }
  for (let i = 0; i < 3; i++) {
    const e = pick(activeEquipment)
    buildRequest(undefined, e, problemFor(e), 'Low', subDays(now, int(3, 40)), 'Rejected')
  }

  // Equipment status follows open corrective work
  for (const wo of workOrders) {
    if (wo.type !== 'Corrective' || wo.status === 'Completed' || wo.status === 'Cancelled') continue
    const e = equipment.find((x) => x.id === wo.equipmentId)!
    if (wo.priority === 'Critical' && wo.status !== 'InProgress') e.status = 'OutOfService'
    else if (wo.status === 'InProgress' && e.status === 'Operational') e.status = 'UnderMaintenance'
  }

  // Stock receipts roughly monthly
  for (const p of parts) {
    for (let m = 5; m >= 0; m--) {
      if (!chance(0.5)) continue
      transactions.push({ id: id(), partId: p.id, type: 'Receipt', quantity: Math.max(p.minimumStock, 2) * int(1, 2), userId: admin.id, atUtc: iso(addDays(subDays(today, m * 30), int(0, 5))), note: `PO-${int(40000, 49999)}` })
    }
  }
  transactions.sort((a, b) => a.atUtc.localeCompare(b.atUtc))
  workOrders.sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc))
  requests.sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc))

  // ── Notifications ────────────────────────────────────────────────────────
  const notifications: Notification[] = []
  const notify = (userId: string, title: string, body: string, link: string, at: Date, read = false) =>
    notifications.push({ id: id(), userId, title, body, link, atUtc: iso(at), read })
  for (const wo of workOrders.filter((w) => w.assigneeId === primaryTech.id && w.status === 'Assigned').slice(0, 3)) {
    notify(primaryTech.id, 'New work order assigned', `${wo.number}: ${wo.title}`, `/tech/jobs/${wo.id}`, new Date(wo.createdAtUtc))
  }
  for (const r of requests.filter((x) => x.status === 'Submitted')) {
    for (const s of supervisors) notify(s.id, 'New maintenance request', `${r.number} needs review`, `/supervisor/requests`, new Date(r.createdAtUtc))
  }
  for (const p of parts.filter((x) => x.quantityOnHand <= x.minimumStock)) {
    notify(admin.id, 'Low stock', `${p.name} is at ${p.quantityOnHand} ${p.unit} (min ${p.minimumStock})`, '/admin/inventory', subDays(now, rand() * 3))
  }

  return {
    version: DEMO_DB_VERSION,
    seededAtUtc: iso(now),
    counters: { workOrder: woSeq, request: mrSeq },
    organizations,
    facilities,
    departments,
    locations,
    categories: Object.values(categories),
    equipment,
    users,
    workOrders,
    workLogs,
    requests,
    pmSchedules,
    parts,
    transactions,
    downtimes,
    notifications,
    settings: {
      organizationId: orgId,
      workOrderPrefix: 'WO',
      requestPrefix: 'MR',
      prioritySlaHours: slaHours,
      laborRatePerHour: 45,
      notifyOnNewRequest: true,
      notifyOnAssignment: true,
      notifyOnOverdue: true,
      lowStockAlerts: true,
    },
  }
}
