import { Home, LayoutDashboard, type LucideIcon } from 'lucide-react'
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
  Admin: [{ items: [{ label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true }] }],
  Supervisor: [{ items: [{ label: 'Dashboard', to: '/supervisor', icon: LayoutDashboard, end: true }] }],
}

export const MOBILE_NAV: Partial<Record<Role, NavItem[]>> = {
  Technician: [{ label: 'Home', to: '/tech', icon: Home, end: true }],
  Operator: [{ label: 'Home', to: '/operator', icon: Home, end: true }],
}
