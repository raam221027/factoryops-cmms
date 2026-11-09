import type QrScannerType from 'qr-scanner'
import { CameraOff, Keyboard, Loader2, ScanLine } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import type { Equipment } from '@/domain/types'
import { assetIdFromScan } from '@/lib/dateRange'
import { errorMessage, services } from '@/services'

type CameraState = 'starting' | 'scanning' | 'unavailable'

/**
 * Reads an equipment QR label with the camera and resolves it to a machine. Typing the asset
 * ID is always available, since cameras can be missing, blocked, or unable to focus on a
 * dirty label.
 */
export function EquipmentScanner({ onFound }: { onFound: (equipment: Equipment) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const scanner = useRef<QrScannerType | null>(null)
  const busy = useRef(false)
  const [camera, setCamera] = useState<CameraState>('starting')
  const [cameraError, setCameraError] = useState('')
  const [manual, setManual] = useState('')
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)
  const [looking, setLooking] = useState(false)

  const resolve = useCallback(
    async (raw: string) => {
      if (busy.current) return
      const assetId = assetIdFromScan(raw)
      if (!assetId) {
        setMessage({ tone: 'error', text: 'That code is not a FactoryOps equipment label.' })
        return
      }
      busy.current = true
      setLooking(true)
      setMessage({ tone: 'info', text: `Looking up ${assetId}…` })
      try {
        const equipment = await services.equipment.findByAssetId(assetId)
        if (equipment) {
          navigator.vibrate?.(60)
          scanner.current?.stop()
          setMessage(null)
          onFound(equipment)
          return
        }
        setMessage({ tone: 'error', text: `No equipment with asset ID "${assetId}". Check the label or type the ID.` })
      } catch (e) {
        setMessage({ tone: 'error', text: errorMessage(e) })
      } finally {
        busy.current = false
        setLooking(false)
      }
    },
    [onFound],
  )

  useEffect(() => {
    let cancelled = false
    async function start() {
      if (!video.current) return
      if (!window.isSecureContext || !navigator.mediaDevices) {
        setCamera('unavailable')
        setCameraError('The camera needs a secure (https) connection.')
        return
      }
      try {
        const { default: QrScanner } = await import('qr-scanner')
        if (cancelled || !video.current) return
        if (!(await QrScanner.hasCamera())) {
          setCamera('unavailable')
          setCameraError('No camera found on this device.')
          return
        }
        const s = new QrScanner(video.current, (result) => void resolve(result.data), {
          preferredCamera: 'environment',
          highlightScanRegion: true,
          highlightCodeOutline: true,
          maxScansPerSecond: 5,
          returnDetailedScanResult: true,
        })
        scanner.current = s
        await s.start()
        if (!cancelled) setCamera('scanning')
      } catch (e) {
        if (cancelled) return
        setCamera('unavailable')
        const text = String(e instanceof Error ? e.message : e)
        setCameraError(/denied|permission|notallowed/i.test(text) ? 'Camera access was blocked. Allow it in your browser settings, or type the asset ID.' : 'The camera could not be started.')
      }
    }
    void start()
    return () => {
      cancelled = true
      scanner.current?.destroy()
      scanner.current = null
    }
  }, [resolve])

  return (
    <div>
      <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-xl bg-foreground">
        <video ref={video} className="size-full object-cover" muted playsInline aria-label="Camera preview" />
        {camera !== 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-white">
            {camera === 'starting' ? (
              <>
                <Loader2 className="size-8 animate-spin" aria-hidden />
                <p className="text-sm">Starting camera…</p>
              </>
            ) : (
              <>
                <CameraOff className="size-8" aria-hidden />
                <p className="text-sm">{cameraError}</p>
              </>
            )}
          </div>
        )}
        {camera === 'scanning' && (
          <p className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5 text-sm font-medium text-white drop-shadow">
            <ScanLine className="size-4" aria-hidden /> Looking for a label…
          </p>
        )}
      </div>

      <div aria-live="polite" className="mb-3 min-h-5">
        {message && <p className={message.tone === 'error' ? 'text-sm text-danger' : 'text-sm text-muted-foreground'}>{message.text}</p>}
      </div>

      <form
        className="rounded-lg border bg-surface p-4 shadow-card"
        onSubmit={(e) => {
          e.preventDefault()
          if (manual.trim()) void resolve(manual)
        }}
      >
        <Label htmlFor="asset-id" className="mb-1.5 flex items-center gap-1.5">
          <Keyboard className="size-4 text-muted-foreground" aria-hidden /> Or type the asset ID
        </Label>
        <div className="flex gap-2">
          <Input
            id="asset-id"
            value={manual}
            onChange={(e) => setManual(e.target.value.toUpperCase())}
            placeholder="e.g. CNC-003"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="h-12 flex-1 font-mono text-base"
          />
          <Button type="submit" size="lg" className="h-12" disabled={!manual.trim()} loading={looking}>
            Find
          </Button>
        </div>
      </form>
    </div>
  )
}
