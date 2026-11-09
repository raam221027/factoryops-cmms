import { useSearchParams } from 'react-router'
import { ReportWizard } from '@/features/requests/ReportWizard'

export function ReportPage() {
  const [params] = useSearchParams()
  return (
    <ReportWizard
      key={params.get('equipment') ?? ''}
      home="/operator"
      initialEquipmentId={params.get('equipment') ?? ''}
      startScanning={params.get('scan') === '1'}
      requestPath={(id) => `/operator/requests/${id}`}
    />
  )
}
