import { useSearchParams } from 'react-router'
import { ReportWizard } from '@/features/requests/ReportWizard'

/** Technicians report new faults they find through the same flow as operators. */
export function TechReportPage() {
  const [params] = useSearchParams()
  const equipmentId = params.get('equipment') ?? ''
  return <ReportWizard key={equipmentId} home={equipmentId ? `/tech/equipment/${equipmentId}` : '/tech'} initialEquipmentId={equipmentId} />
}
