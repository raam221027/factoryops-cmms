import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import type { NavItem } from '@/config/navigation'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { cn } from '@/lib/utils'
import { DemoBadge } from './DemoBadge'
import { Logo } from './Logo'
import { UserMenu } from './UserMenu'

/**
 * Layout for the mobile-first experiences (Technician, Operator): compact header, single
 * column, bottom navigation within thumb reach. On wide screens the column stays phone-width
 * so the experience does not stretch into a sparse desktop page.
 */
export function MobileShell({ items, profilePath, highlight, headerAction }: { items: NavItem[]; profilePath?: string; highlight?: string; headerAction?: ReactNode }) {
  const showNav = items.length > 1
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-30 border-b bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-4">
          <Logo />
          <DemoBadge />
          <div className="ml-auto flex items-center gap-1">
            {headerAction}
            <NotificationBell />
            <UserMenu profilePath={profilePath} compact />
          </div>
        </div>
      </header>

      <main id="main" className={cn('mx-auto w-full max-w-2xl px-4 py-4', showNav && 'pb-28')}>
        <Outlet />
      </main>

      {showNav && (
        <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-surface">
          <ul className="mx-auto flex max-w-2xl">
            {items.map((item) => {
              const isHighlight = item.to === highlight
              return (
                <li key={item.to} className="flex-1">
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground',
                        isActive && 'text-primary',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            'flex items-center justify-center rounded-full',
                            isHighlight ? 'size-11 -mt-5 bg-primary text-primary-foreground shadow-popover ring-4 ring-surface' : 'h-7 w-12',
                            !isHighlight && isActive && 'bg-primary-soft',
                          )}
                        >
                          <item.icon className="size-5" aria-hidden />
                        </span>
                        {item.label}
                      </>
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </div>
  )
}
