import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

export function QrCode({ value, size = 160, className, label }: { value: string; size?: number; className?: string; label: string }) {
  const [svg, setSvg] = useState<string>()
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } })
      .then((s) => !cancelled && setSvg(s))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [value])

  if (error) return <p className="text-xs text-danger">Could not generate QR code.</p>
  if (!svg) return <Skeleton className={className} style={{ width: size, height: size }} />
  return (
    // Generated locally by the qrcode library from our own data; contains no user HTML.
    <div role="img" aria-label={label} className={cn('[&_svg]:h-full [&_svg]:w-full', className)} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />
  )
}
