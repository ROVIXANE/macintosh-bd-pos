import { describe, expect, it } from 'vitest'
import { can, hasAny, PERMISSIONS } from './permissions'

describe('permission matrix', () => {
  it('gives the owner every permission', () => {
    for (const permission of PERMISSIONS) expect(can('owner', permission)).toBe(true)
  })

  it('withholds sensitive permissions from admins', () => {
    expect(can('admin', 'users.manage')).toBe(false)
    expect(can('admin', 'settings.edit')).toBe(false)
    expect(can('admin', 'audit.view')).toBe(false)
    expect(can('admin', 'reports.profit')).toBe(false)
    expect(can('admin', 'products.edit')).toBe(true)
    expect(can('admin', 'returns.approve')).toBe(true)
  })

  it('keeps sales staff inside POS and customer workflows', () => {
    expect(can('sales', 'pos.access')).toBe(true)
    expect(can('sales', 'customers.create')).toBe(true)
    expect(can('sales', 'returns.request')).toBe(true)
    expect(can('sales', 'inventory.adjust')).toBe(false)
    expect(can('sales', 'returns.approve')).toBe(false)
    expect(can('sales', 'users.view')).toBe(false)
    expect(can('sales', 'reports.view')).toBe(false)
  })

  it('keeps inventory staff out of sales and cash workflows', () => {
    expect(can('inventory', 'inventory.adjust')).toBe(true)
    expect(can('inventory', 'purchases.create')).toBe(true)
    expect(can('inventory', 'reports.inventory')).toBe(true)
    expect(can('inventory', 'pos.access')).toBe(false)
    expect(can('inventory', 'sales.view')).toBe(false)
    expect(can('inventory', 'cash.manage')).toBe(false)
  })

  it('denies all permissions without a role', () => {
    expect(can(null, 'dashboard.view')).toBe(false)
    expect(can(undefined, 'pos.access')).toBe(false)
    expect(hasAny('sales', ['inventory.adjust', 'users.manage'])).toBe(false)
    expect(hasAny('sales', ['pos.access', 'users.manage'])).toBe(true)
  })

  it('matches the SQL helper for representative permission boundaries', () => {
    // Mirrors public.has_permission() in supabase/migrations/00003_functions.sql.
    const expected = {
      owner: [true, true, true, true, true],
      admin: [true, true, true, false, false],
      sales: [true, false, false, false, false],
      inventory: [false, true, false, false, false],
    }
    const probes = ['pos.access', 'inventory.adjust', 'returns.approve', 'reports.profit', 'users.manage'] as const
    for (const [role, values] of Object.entries(expected)) {
      probes.forEach((permission, index) => {
        expect(can(role as keyof typeof expected, permission)).toBe(values[index])
      })
    }
  })
})
