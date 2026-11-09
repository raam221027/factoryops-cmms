import { Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTitle, SheetContent } from '@/components/ui/dialog'
import type { NavSection } from '@/config/navigation'
import { NotificationBell } from '@/features/notifications/NotificationBell'
import { ConnectivityBanner } from '@/features/pwa/PwaPrompts'
import { cn } from '@/lib/utils'
import { DemoBadge } from './DemoBadge'
import { Logo } from './Logo'
import { UserMenu } from './UserMenu'

function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {sections.map((section, i) => (
        <div key={section.title ?? i}>
          {section.title && <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">{section.title}</p>}
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-white/5 hover:text-white',
                      isActive && 'bg-sidebar-active text-sidebar-active-foreground shadow-[inset_2px_0_0_0_var(--color-chart-3)]',
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function SidebarFrame({ sections, onNavigate, footer }: { sections: NavSection[]; onNavigate?: () => void; footer?: string }) {
  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex h-14 items-center border-b border-sidebar-border px-5">
        <Logo inverted />
      </div>
      <SidebarNav sections={sections} onNavigate={onNavigate} />
      {footer && <p className="border-t border-sidebar-border px-5 py-3 text-xs text-sidebar-foreground/70">{footer}</p>}
    </div>
  )
}

/**
 * Layout for the desktop-first experiences (Admin, Supervisor): persistent sidebar on large
 * screens, slide-in drawer on tablets and phones.
 */
export function DesktopShell({ sections, workspaceLabel, profilePath }: { sections: NavSection[]; workspaceLabel: string; profilePath?: string }) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setDrawerOpen(false), [location.pathname])

  return (
    <div className="min-h-dvh lg:pl-60">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-60 lg:block">
        <SidebarFrame sections={sections} footer={workspaceLabel} />
      </aside>

      <Dialog open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent aria-describedby={undefined}>
          <DialogTitle className="sr-only">Navigation</DialogTitle>
          <SidebarFrame sections={sections} footer={workspaceLabel} onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Dialog>

      <header className="pt-safe sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-2 border-b bg-surface/95 px-3 backdrop-blur sm:px-5">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setDrawerOpen(true)} aria-label="Open navigation">
          <Menu />
        </Button>
        <Logo className="lg:hidden" />
        <span className="hidden text-sm font-medium text-muted-foreground lg:inline">{workspaceLabel}</span>
        <DemoBadge className="ml-1" />
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          <UserMenu profilePath={profilePath} />
        </div>
      </header>
      <ConnectivityBanner className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20" />

      <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 lg:py-6">
        <Outlet />
      </main>
    </div>
  )
}
