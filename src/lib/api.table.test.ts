import { beforeEach, describe, expect, it, vi } from 'vitest'

const from = vi.fn()
const select = vi.fn()
const rpc = vi.fn()

vi.mock('./supabase', () => ({
  getSupabase: () => ({ from, rpc }),
  getEphemeralClient: () => ({ auth: { signUp: vi.fn() } }),
  isSupabaseConfigured: true,
}))

import { api } from './api'

function chainable(data: unknown = [], error: unknown = null) {
  const obj: Record<string, unknown> = {
    select: (...args: unknown[]) => { select(...args); return obj },
    eq: () => obj,
    order: () => obj,
    limit: () => obj,
    gte: () => obj,
    lte: () => obj,
    single: () => obj,
    maybeSingle: () => obj,
    then: (resolve: (value: unknown) => unknown) => resolve({ data, error }),
  }
  return obj
}

describe('api table() targets real table names', () => {
  beforeEach(() => {
    from.mockReset()
    select.mockReset()
    rpc.mockReset()
    from.mockReturnValue(chainable([]))
  })

  it('listProducts reads public.products', async () => {
    await api.listProducts()
    expect(from).toHaveBeenCalledWith('products')
    expect(select).toHaveBeenCalledWith('*')
  })

  it('listCustomers reads public.customers', async () => {
    await api.listCustomers()
    expect(from).toHaveBeenCalledWith('customers')
  })

  it('listSuppliers reads public.suppliers', async () => {
    await api.listSuppliers()
    expect(from).toHaveBeenCalledWith('suppliers')
  })

  it('listSerials reads public.product_serials with join projection', async () => {
    await api.listSerials()
    expect(from).toHaveBeenCalledWith('product_serials')
    expect(select).toHaveBeenCalledWith('*,product:products(id,name,sku),supplier:suppliers(id,name)')
  })

  it('listPurchases reads public.purchases with joins', async () => {
    await api.listPurchases()
    expect(from).toHaveBeenCalledWith('purchases')
    expect(select).toHaveBeenCalledWith('*,supplier:suppliers(id,name,company),items:purchase_items(*,product:products(id,name,sku))')
  })

  it('listReturns reads public.returns with joins', async () => {
    await api.listReturns()
    expect(from).toHaveBeenCalledWith('returns')
  })

  it('listClaims reads public.warranty_claims with joins', async () => {
    await api.listClaims()
    expect(from).toHaveBeenCalledWith('warranty_claims')
  })

  it('listShifts reads public.cash_shifts with employee join', async () => {
    await api.listShifts()
    expect(from).toHaveBeenCalledWith('cash_shifts')
  })

  it('listHeldCarts reads public.held_carts with customer join', async () => {
    await api.listHeldCarts()
    expect(from).toHaveBeenCalledWith('held_carts')
    expect(select).toHaveBeenCalledWith('*,customer:customers(id,name)')
  })

  it('listUsers reads public.profiles', async () => {
    await api.listUsers()
    expect(from).toHaveBeenCalledWith('profiles')
  })

  it('listAudit reads public.audit_logs', async () => {
    await api.listAudit()
    expect(from).toHaveBeenCalledWith('audit_logs')
  })
})
