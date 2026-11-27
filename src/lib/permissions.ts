import type { Role } from './types'

/** This matrix mirrors public.has_permission() in supabase/migrations/00003_functions.sql. */
export const PERMISSIONS = [
  'dashboard.view',
  'pos.access',
  'products.view', 'products.create', 'products.edit', 'products.delete',
  'inventory.view', 'inventory.receive', 'inventory.adjust', 'inventory.audit',
  'serials.view', 'serials.manage',
  'customers.view', 'customers.create', 'customers.edit', 'customers.delete',
  'suppliers.view', 'suppliers.create', 'suppliers.edit',
  'purchases.view', 'purchases.create',
  'sales.view', 'invoices.view', 'invoices.print', 'held_carts.manage',
  'returns.view', 'returns.create', 'returns.approve', 'returns.request',
  'warranty.view', 'warranty.manage',
  'expenses.view', 'expenses.create',
  'cash.view', 'cash.manage',
  'reports.view', 'reports.inventory', 'reports.profit',
  'users.view', 'users.manage',
  'settings.view', 'settings.edit',
  'audit.view',
  'broadcast.manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const OWNER: Permission[] = [...PERMISSIONS]

const ADMIN: Permission[] = PERMISSIONS.filter(
  (permission) => !['users.manage', 'settings.edit', 'audit.view', 'reports.profit'].includes(permission),
) as Permission[]

const SALES: Permission[] = [
  'dashboard.view', 'pos.access', 'products.view',
  'customers.view', 'customers.create', 'customers.edit',
  'sales.view', 'invoices.view', 'invoices.print', 'held_carts.manage',
  'returns.view', 'returns.request', 'warranty.view', 'warranty.manage',
  'cash.view', 'cash.manage',
]

const INVENTORY: Permission[] = [
  'dashboard.view', 'products.view', 'products.create', 'products.edit',
  'inventory.view', 'inventory.receive', 'inventory.adjust', 'inventory.audit',
  'serials.view', 'serials.manage',
  'suppliers.view', 'suppliers.create', 'suppliers.edit',
  'purchases.view', 'purchases.create',
  'warranty.view',
  'reports.view', 'reports.inventory',
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: OWNER,
  admin: ADMIN,
  sales: SALES,
  inventory: INVENTORY,
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  sales: 'Sales Staff',
  inventory: 'Inventory Staff',
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function hasAny(role: Role | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(role, permission))
}
