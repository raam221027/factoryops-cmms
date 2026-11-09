import { Delete } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const

/** Large-key PIN entry for shared kiosks and gloved hands. Submits automatically at full length. */
export function PinPad({ length = 4, onSubmit, error, busy }: { length?: number; onSubmit: (pin: string) => Promise<unknown>; error?: string; busy?: boolean }) {
  const [pin, setPin] = useState('')

  async function press(key: (typeof KEYS)[number]) {
    if (busy) return
    if (key === 'del') return setPin((p) => p.slice(0, -1))
    const next = (pin + key).slice(0, length)
    setPin(next)
    if (next.length === length) {
      try {
        await onSubmit(next)
      } finally {
        setPin('')
      }
    }
  }

  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="mb-2 flex justify-center gap-3" aria-live="polite" aria-label={`${pin.length} of ${length} digits entered`}>
        {Array.from({ length }, (_, i) => (
          <span key={i} className={cn('size-3.5 rounded-full border-2 border-primary', i < pin.length && 'bg-primary')} />
        ))}
      </div>
      <p className={cn('mb-3 h-5 text-center text-sm', error ? 'text-danger' : 'text-muted-foreground')} role={error ? 'alert' : undefined}>
        {error ?? (busy ? 'Checking…' : '')}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((key) =>
          key === '' ? (
            <span key="blank" />
          ) : (
            <Button
              key={key}
              type="button"
              variant={key === 'del' ? 'ghost' : 'outline'}
              className="h-14 text-xl font-semibold"
              onClick={() => void press(key)}
              disabled={busy}
              aria-label={key === 'del' ? 'Delete digit' : key}
            >
              {key === 'del' ? <Delete className="size-5" /> : key}
            </Button>
          ),
        )}
      </div>
    </div>
  )
}
