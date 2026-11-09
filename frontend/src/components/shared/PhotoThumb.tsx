import { ImageOff } from 'lucide-react'
import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { safeAttachmentUrl } from '@/lib/url'
import { cn } from '@/lib/utils'

/**
 * Square photo thumbnail that opens the full image in a viewer. Opening data: URLs in a new tab
 * is blocked by browsers, so photos are always shown in-app.
 */
export function PhotoThumb({ url, alt, caption, className }: { url: string; alt: string; caption?: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const src = safeAttachmentUrl(url)
  if (!src)
    return (
      <div className={cn('flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border bg-muted text-xs text-muted-foreground', className)} role="img" aria-label={`${alt} (unavailable)`}>
        <ImageOff className="size-5" aria-hidden />
        Unavailable
      </div>
    )
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('group block w-full overflow-hidden rounded-md border focus-visible:outline-2 focus-visible:outline-ring', className)} aria-label={`View ${alt}`}>
        <img src={src} alt={alt} className="aspect-square w-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
        {caption && <span className="block truncate px-2 py-1 text-left text-xs text-muted-foreground">{caption}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="lg">
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <DialogDescription className="sr-only">Full-size photo</DialogDescription>
          <img src={src} alt={alt} className="max-h-[80dvh] w-full object-contain" />
          {caption && <p className="border-t px-4 py-2 text-sm text-muted-foreground">{caption}</p>}
        </DialogContent>
      </Dialog>
    </>
  )
}
