import {
  LayoutDashboard,
  PackageCheck,
  PackageOpen,
  Truck,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  icon?: LucideIcon
  path?: string
  children?: NavItem[]
}

/**
 * Only the pages with real, working functionality — promoted to top level.
 * Dummy/coming-soon links and mock-only pages were removed for the prototype.
 */
export const navItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/console',
  },
  {
    id: 'consignment-order',
    label: 'Consignment Order',
    icon: PackageCheck,
    path: '/console/order-management/consignment-order',
  },
  {
    id: 'pickup-request',
    label: 'Pickup Request',
    icon: PackageOpen,
    path: '/console/order-management/pickup-request',
  },
  {
    id: 'dispatch-planning',
    label: 'Dispatch Planning',
    icon: Truck,
    path: '/console/order-management/dispatch-planning',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    path: '/console/settings',
  },
]
