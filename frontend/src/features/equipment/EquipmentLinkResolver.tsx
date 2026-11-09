import { useQuery } from '@tanstack/react-query'
import { QrCode } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router'
import { EmptyState, ErrorState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import type { Role } from '@/domain/enums'
import { ROLE_HOME } from '@/domain/permissions'
import type { Equipment } from '@/domain/types'
import { useSessionUser } from '@/features/auth/context'
import { FullPageSpinner } from '@/features/auth/RequireRole'
import { services } from '@/services'

/** Where a scanned equipment QR code takes each role. Roles without a target go home. */
const TARGET: Partial<Record<Role, (e: Equipment) => string>> = {
  Admin: (e) => `/admin/equipment/${e.id}`,
  Supervisor: (e) => `/supervisor/equipment/${e.id}`,
  Technician: (e) => `/tech/equipment/${e.id}`,
}

/**
 * Landing route for equipment QR labels (`/equipment/:assetId`). The label encodes only the
 * asset ID; the destination depends on who scans it.
 */
export function EquipmentLinkResolver() {
  const { assetId = '' } = useParams()
  const user = useSessionUser()
  const lookup = useQuery({ queryKey: ['equipment', 'by-asset', assetId], queryFn: () => services.equipment.findByAssetId(assetId) })

  if (lookup.isPending) return <FullPageSpinner />
  const home = ROLE_HOME[user.role]
  if (lookup.error) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <ErrorState error={lookup.error} onRetry={() => void lookup.refetch()} />
      </main>
    )
  }
  if (!lookup.data) {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <EmptyState
          icon={QrCode}
          title={`Unknown asset "${assetId}"`}
          description="This label does not match any registered equipment. It may have been re-labelled or retired."
          action={
            <Button asChild>
              <Link to={home}>Go to my home</Link>
            </Button>
          }
        />
      </main>
    )
  }
  const target = TARGET[user.role]
  return <Navigate to={target ? target(lookup.data) : home} replace />
}
