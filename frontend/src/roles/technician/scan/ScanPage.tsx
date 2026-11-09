import { useCallback } from 'react'
import { useNavigate } from 'react-router'
import type { Equipment } from '@/domain/types'
import { EquipmentScanner } from '@/features/equipment/EquipmentScanner'
import { MobileHeader } from '../components'

export function ScanPage() {
  const navigate = useNavigate()
  const open = useCallback((e: Equipment) => navigate(`/tech/equipment/${e.id}`), [navigate])
  return (
    <>
      <MobileHeader title="Scan equipment" subtitle="Point the camera at the QR label on the machine." back="/tech" />
      <EquipmentScanner onFound={open} />
    </>
  )
}
