import type { ReactNode } from 'react'

/**
 * Primary actions pinned above the mobile bottom navigation, within thumb reach. Includes a
 * spacer so the last content is not hidden behind it. Compacts on short (landscape) screens.
 */
export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="h-20 short:h-14" aria-hidden />
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t bg-surface/95 backdrop-blur short:bottom-[calc(3rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl gap-2 px-4 py-2.5 short:py-1.5 short:*:h-11">{children}</div>
      </div>
    </>
  )
}
