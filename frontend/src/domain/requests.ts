import type { Priority } from './enums'
import type { MaintenanceRequest } from './types'

export type RequestStageKey = 'review' | 'approved' | 'scheduled' | 'repairing' | 'paused' | 'fixed' | 'rejected' | 'cancelled'

export interface RequestStage {
  key: RequestStageKey
  label: string
  tone: 'info' | 'primary' | 'warning' | 'success' | 'neutral'
  /** Still waiting for something to happen */
  open: boolean
}

/**
 * Where a reported problem stands, in the requester's words: from review through repair.
 * Combines the request status with the projected status of its work order.
 */
export function requestStage(req: Pick<MaintenanceRequest, 'status' | 'progress'>): RequestStage {
  if (req.status === 'Submitted') return { key: 'review', label: 'Awaiting review', tone: 'info', open: true }
  if (req.status === 'Rejected') return { key: 'rejected', label: 'Not approved', tone: 'neutral', open: false }
  switch (req.progress?.status) {
    case 'Completed':
      return { key: 'fixed', label: 'Fixed', tone: 'success', open: false }
    case 'Cancelled':
      return { key: 'cancelled', label: 'Closed without repair', tone: 'neutral', open: false }
    case 'InProgress':
      return { key: 'repairing', label: 'Being repaired', tone: 'warning', open: true }
    case 'OnHold':
      return { key: 'paused', label: 'Repair paused', tone: 'warning', open: true }
    case 'Assigned':
      return { key: 'scheduled', label: 'Technician assigned', tone: 'primary', open: true }
    default:
      return { key: 'approved', label: 'Approved · awaiting technician', tone: 'primary', open: true }
  }
}

/** Plain-language severity choices for reporters, mapped to priorities. */
export const SEVERITY_CHOICES: { value: Priority; title: string; hint: string }[] = [
  { value: 'Critical', title: 'Machine stopped or unsafe', hint: 'Production has stopped, or someone could get hurt' },
  { value: 'High', title: 'Running, but badly', hint: 'Producing scrap, running slow, or likely to stop soon' },
  { value: 'Medium', title: 'Running normally for now', hint: 'Needs attention in the next day or two' },
  { value: 'Low', title: 'Minor', hint: 'Cosmetic, or can wait for planned maintenance' },
]

/** Photos an operator can attach to one report. */
export const REPORT_MAX_PHOTOS = 3
/** Shortest useful problem description; the API applies the same rule. */
export const REPORT_MIN_DESCRIPTION = 10
