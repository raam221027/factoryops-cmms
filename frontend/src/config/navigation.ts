import {
  BarChart3,
  Boxes,
  Building2,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  Cog,
  Gauge,
  HardHat,
  Home,
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/domain/enums'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** Match the path exactly (for index routes) */
  end?: boolean
}

export interface NavSection {
  title?: string
  items: NavItem[]
}

/*
 * Navigation per role experience. Items are added here as each role's screens are built.
 * Desktop roles use sections in a sidebar; mobile roles use a flat bottom bar.
 */
export const DESKTOP_NAV: Partial<Record<Role, NavSection[]>> = {
  Admin: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
        { label: 'Reports', to: '/admin/reports', icon: BarChart3 },
      ],
    },
    {
      title: 'Assets',
      items: [
        { label: 'Equipment', to: '/admin/equipment', icon: Cog },
        { label: 'Preventive maintenance', to: '/admin/pm', icon: CalendarClock },
        { label: 'Inventory', to: '/admin/inventory', icon: Boxes },
      ],
    },
    {
      title: 'Administration',
      items: [
        { label: 'Organization', to: '/admin/organization', icon: Building2 },
        { label: 'Users', to: '/admin/users', icon: Users },
        { label: 'Settings', to: '/admin/settings', icon: Settings },
      ],
    },
  ],
  Supervisor: [
    {
      title: 'Overview',
      items: [
        { label: 'Dashboard', to: '/supervisor', icon: LayoutDashboard, end: true },
        { label: 'Requests', to: '/supervisor/requests', icon: Inbox },
      ],
    },
    {
      title: 'Work',
      items: [
        { label: 'Work orders', to: '/supervisor/work-orders', icon: ClipboardList },
        { label: 'Board', to: '/supervisor/board', icon: KanbanSquare },
        { label: 'Schedule', to: '/supervisor/schedule', icon: CalendarRange },
      ],
    },
    {
      title: 'Team & assets',
      items: [
        { label: 'Technicians', to: '/supervisor/technicians', icon: HardHat },
        { label: 'Equipment', to: '/supervisor/equipment', icon: Gauge },
      ],
    },
  ],
}

export const MOBILE_NAV: Partial<Record<Role, NavItem[]>> = {
  Technician: [{ label: 'Home', to: '/tech', icon: Home, end: true }],
  Operator: [{ label: 'Home', to: '/operator', icon: Home, end: true }],
}
