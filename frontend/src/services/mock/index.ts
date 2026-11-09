import { compressImage } from '@/lib/image'
import type { DataServices } from '../contracts'
import { mockEquipment, mockOrganization, mockUsers } from './catalog'
import { mockDowntime, mockInventory, mockNotifications, mockPm, mockSettings } from './operations'
import { mockRequests } from './requests'
import { mockWorkOrders } from './workOrders'

export const mockServices: DataServices = {
  organization: mockOrganization,
  equipment: mockEquipment,
  users: mockUsers,
  workOrders: mockWorkOrders,
  requests: mockRequests,
  pm: mockPm,
  inventory: mockInventory,
  downtime: mockDowntime,
  notifications: mockNotifications,
  settings: mockSettings,
  attachments: {
    // Demo mode keeps photos inline as compressed data URLs.
    upload: async (file) => ({ fileName: file.name, url: await compressImage(file) }),
  },
}
