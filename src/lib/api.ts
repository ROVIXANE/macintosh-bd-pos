import { getEphemeralClient, getSupabase } from './supabase'
import type {
  AuditLog, Brand, CashMovement, CashShift, CartItem, Category, CheckoutInput, CheckoutResult,
  Customer, CustomerHistory, Expense, HeldCart, PaymentInput, Product, ProductInput, ProductSerial,
  Profile, Purchase, ReturnRecord, Role, Sale, StockMovement, StoreSettings, Supplier,
  SupplierPayment, WarrantyClaim,
} from './types'

type Query = { data: unknown | null; error: { message: string; code?: string } | null }

async function unwrap<T>(query: PromiseLike<Query>): Promise<T> {
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return data as T
}

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await getSupabase().rpc(name, args)
  if (error) throw new Error(error.message)
  return data as T
}

function table<T>(name: string, select = '*') {
  const client = getSupabase()
  return {
    list: (): Promise<T[]> => unwrap<T[]>(client.from(name).select(select) as unknown as PromiseLike<Query>),
    get: (id: string): Promise<T> => unwrap<T>(client.from(name).select(select).eq('id', id).single() as unknown as PromiseLike<Query>),
    save: async (record: Partial<T> & { id?: string }): Promise<T> => {
      const { id, ...payload } = record
      const result = id
        ? await client.from(name).update(payload as never).eq('id', id).select(select ?? '*').single()
        : await client.from(name).insert(payload as never).select(select ?? '*').single()
      if (result.error) throw new Error(result.error.message)
      return result.data as T
    },
    remove: async (id: string): Promise<void> => {
      const { error } = await client.from(name).delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
  }
}

const SALE_SELECT = '*,customer:customers(id,name,phone),employee:profiles(id,full_name),items:sale_items(*,product:products(id,name,sku)),payments:sale_payments(*)'
const PURCHASE_SELECT = '*,supplier:suppliers(id,name,company),items:purchase_items(*,product:products(id,name,sku))'
const SERIAL_SELECT = '*,product:products(id,name,sku),supplier:suppliers(id,name)'
const MOVEMENT_SELECT = '*,product:products(id,name,sku),employee:profiles(id,full_name)'
const RETURN_SELECT = '*,sale:sales(id,invoice_number,total),customer:customers(id,name),items:return_items(*,product:products(id,name,sku))'
const CLAIM_SELECT = '*,product:products(id,name,sku),customer:customers(id,name,phone),serial:product_serials(id,serial_number)'
const EXPENSE_SELECT = '*,employee:profiles(id,full_name)'
const SHIFT_SELECT = '*,employee:profiles(id,full_name)'

function dateFilter(query: any, from?: string, to?: string, column = 'created_at') {
  let next = query
  if (from) next = next.gte(column, from)
  if (to) next = next.lte(column, `${to}T23:59:59.999Z`)
  return next
}

export const api = {
  isConfigured: () => Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),

  // Reference data ----------------------------------------------------------
  listCategories: () => table<Category>('categories').list(),
  saveCategory: (record: Partial<Category>) => table<Category>('categories').save(record),
  deleteCategory: (id: string) => table<Category>('categories').remove(id),
  listBrands: () => table<Brand>('brands').list(),
  saveBrand: (record: Partial<Brand>) => table<Brand>('brands').save(record),
  deleteBrand: (id: string) => table<Brand>('brands').remove(id),

  // Products and stock ------------------------------------------------------
  listProducts: () => table<Product>('products').list(),
  getProduct: async (id: string): Promise<Product> => {
    const result = await getSupabase().from('products').select('*').eq('id', id).single()
    if (result.error) throw new Error(result.error.message)
    return result.data as Product
  },
  saveProduct: (input: ProductInput): Promise<Product> => {
    const { id, ...payload } = input
    return table<Product>('products').save(id ? { ...payload, id } : payload)
  },
  deleteProduct: (id: string) => table<Product>('products').save({ id, is_archived: true }),

  listSerials: () => table<ProductSerial>('product_serials', SERIAL_SELECT).list(),
  saveSerial: (record: Partial<ProductSerial>) => table<ProductSerial>('product_serials').save(record),
  deleteSerial: (id: string) => table<ProductSerial>('product_serials').remove(id),
  listMovements: (filters: { from?: string; to?: string; product_id?: string } = {}): Promise<StockMovement[]> => {
    let query = getSupabase().from('stock_movements').select(MOVEMENT_SELECT).order('created_at', { ascending: false }).limit(500)
    query = dateFilter(query, filters.from, filters.to)
    if (filters.product_id) query = query.eq('product_id', filters.product_id)
    return unwrap<StockMovement[]>(query as unknown as PromiseLike<Query>)
  },
  adjustStock: (input: { product_id: string; quantity: number; movement_type: string; reason: string; location?: string | null }) =>
    rpc<{ previous_quantity: number; new_quantity: number }>('adjust_stock', {
      p_product_id: input.product_id, p_quantity: input.quantity, p_movement_type: input.movement_type,
      p_reason: input.reason, p_location: input.location ?? null,
    }),

  // People ------------------------------------------------------------------
  listCustomers: () => table<Customer>('customers').list(),
  getCustomer: (id: string) => table<Customer>('customers').get(id),
  saveCustomer: (record: Partial<Customer>) => table<Customer>('customers').save(record),
  deleteCustomer: (id: string) => table<Customer>('customers').remove(id),
  getCustomerHistory: async (id: string): Promise<CustomerHistory> => {
    const customer = await table<Customer>('customers').get(id)
    const [sales, returns] = await Promise.all([
      unwrap<Sale[]>(getSupabase().from('sales').select(SALE_SELECT).eq('customer_id', id).order('sale_date', { ascending: false }) as unknown as PromiseLike<Query>),
      unwrap<ReturnRecord[]>(getSupabase().from('returns').select('*,sale:sales(id,invoice_number)').eq('customer_id', id) as unknown as PromiseLike<Query>),
    ])
    return { customer, sales, returns }
  },

  listSuppliers: () => table<Supplier>('suppliers').list(),
  saveSupplier: (record: Partial<Supplier>) => table<Supplier>('suppliers').save(record),
  deleteSupplier: (id: string) => table<Supplier>('suppliers').remove(id),
  addSupplierPayment: (input: { supplier_id: string; purchase_id?: string | null; amount: number; method: string; reference?: string | null }) =>
    table<SupplierPayment>('supplier_payments').save({ ...input, paid_at: new Date().toISOString() }),

  // Purchasing --------------------------------------------------------------
  listPurchases: () => table<Purchase>('purchases', PURCHASE_SELECT).list(),
  getPurchase: (id: string) => getSupabase().from('purchases').select(PURCHASE_SELECT).eq('id', id).single().then((r) => {
    if (r.error) throw new Error(r.error.message)
    return r.data as Purchase
  }),
  receivePurchase: (input: {
    supplier_id: string; reference: string; purchase_date: string; paid: number; discount: number; tax: number
    items: Array<{ product_id: string; quantity: number; unit_cost: number; serial_numbers: string[] }>
    serials: Array<Record<string, unknown>>
  }) => rpc<{ purchase_id: string; total: number; due: number }>('receive_purchase', {
    p_supplier_id: input.supplier_id || null,
    p_reference: input.reference || null,
    p_purchase_date: input.purchase_date,
    p_paid: input.paid,
    p_discount: input.discount,
    p_tax: input.tax,
    p_items: input.items,
    p_serials: input.serials,
  }),

  // Sales -------------------------------------------------------------------
  listSales: (filters: { from?: string; to?: string; customer_id?: string } = {}): Promise<Sale[]> => {
    let query = getSupabase().from('sales').select(SALE_SELECT).order('sale_date', { ascending: false }).limit(500)
    if (filters.from) query = query.gte('sale_date', filters.from)
    if (filters.to) query = query.lte('sale_date', `${filters.to}T23:59:59.999Z`)
    if (filters.customer_id) query = query.eq('customer_id', filters.customer_id)
    return unwrap<Sale[]>(query as unknown as PromiseLike<Query>)
  },
  getSale: async (id: string): Promise<Sale> => {
    const result = await getSupabase().from('sales').select(SALE_SELECT).eq('id', id).single()
    if (result.error) throw new Error(result.error.message)
    return result.data as Sale
  },
  checkout: (input: CheckoutInput): Promise<CheckoutResult> => rpc<CheckoutResult>('checkout', {
    p_items: input.items.map((item: CartItem) => ({
      product_id: item.product_id, quantity: item.quantity, unit_price: item.unit_price,
      discount: item.discount, serial_id: item.serial_id ?? null,
    })),
    p_customer_id: input.customer_id,
    p_payments: input.payments.map((payment: PaymentInput) => ({
      method: payment.method, amount: payment.amount, reference: payment.reference ?? null,
    })),
    p_discount: input.discount,
    p_tax: input.tax,
    p_delivery: input.delivery,
    p_idempotency_key: input.idempotency_key,
    p_warranty_months: input.warranty_months,
    p_held_cart_id: input.held_cart_id ?? null,
  }),

  listHeldCarts: () => table<HeldCart>('held_carts', '*,customer:customers(id,name)').list(),
  saveHeldCart: (record: Partial<HeldCart>) => table<HeldCart>('held_carts').save(record),
  deleteHeldCart: (id: string) => table<HeldCart>('held_carts').remove(id),

  // Returns and warranty ----------------------------------------------------
  listReturns: () => table<ReturnRecord>('returns', RETURN_SELECT).list(),
  createReturn: (input: {
    sale_id: string; items: Array<{ sale_item_id: string; product_id: string; serial_id: string | null; quantity: number; condition: string }>
    refund_amount: number; reason: string; restock: boolean
  }) => rpc<{ return_id: string; status: string }>('process_return', {
    p_sale_id: input.sale_id,
    p_items: input.items,
    p_refund_amount: input.refund_amount,
    p_reason: input.reason,
    p_restock: input.restock,
  }),
  approveReturn: (id: string, restock: boolean) => rpc<{ return_id: string; status: string }>('approve_return', {
    p_return_id: id, p_restock: restock,
  }),
  listClaims: () => table<WarrantyClaim>('warranty_claims', CLAIM_SELECT).list(),
  saveClaim: (record: Partial<WarrantyClaim>) => table<WarrantyClaim>('warranty_claims').save(record),
  deleteClaim: (id: string) => table<WarrantyClaim>('warranty_claims').remove(id),

  // Expenses ----------------------------------------------------------------
  listExpenses: (filters: { from?: string; to?: string; category?: string } = {}): Promise<Expense[]> => {
    let query = getSupabase().from('expenses').select(EXPENSE_SELECT).order('expense_date', { ascending: false })
    if (filters.from) query = query.gte('expense_date', filters.from)
    if (filters.to) query = query.lte('expense_date', filters.to)
    if (filters.category) query = query.eq('category', filters.category)
    return unwrap<Expense[]>(query as unknown as PromiseLike<Query>)
  },
  saveExpense: (record: Partial<Expense>) => table<Expense>('expenses').save(record),
  deleteExpense: (id: string) => table<Expense>('expenses').remove(id),

  // Cash --------------------------------------------------------------------
  listShifts: () => table<CashShift>('cash_shifts', SHIFT_SELECT).list(),
  openShift: (openingBalance: number, notes: string) => rpc<{ shift_id: string }>('create_cash_shift', {
    p_opening_balance: openingBalance, p_notes: notes || null,
  }),
  closeShift: (shiftId: string, actualClosing: number, notes: string) => rpc<{ difference: number }>('close_cash_shift', {
    p_shift_id: shiftId, p_actual_closing: actualClosing, p_notes: notes || null,
  }),
  listCashMovements: (shiftId?: string): Promise<CashMovement[]> => {
    let query = getSupabase().from('cash_movements').select('*').order('created_at', { ascending: false }).limit(300)
    if (shiftId) query = query.eq('shift_id', shiftId)
    return unwrap<CashMovement[]>(query as unknown as PromiseLike<Query>)
  },
  addCashMovement: (input: { shift_id: string; movement_type: string; amount: number; description: string }) =>
    rpc<{ movement_id: string }>('cash_movement', {
      p_shift_id: input.shift_id, p_movement_type: input.movement_type,
      p_amount: input.amount, p_description: input.description || null,
    }),

  // Users and settings ------------------------------------------------------
  listUsers: () => table<Profile>('profiles').list(),
  applyRole: (userId: string, role: Role) => rpc('apply_role', { p_user: userId, p_role: role }),
  setActive: (userId: string, active: boolean) => rpc('set_profile_active', { p_user: userId, p_active: active }),
  bootstrapOwner: () => rpc('bootstrap_owner'),
  inviteEmployee: async (email: string, fullName: string, role: Role): Promise<{ password: string; roleAssigned: boolean }> => {
    const password = `Mb@${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 14)}Aa1`
    // Never use the persistent client here: signUp would replace the owner session.
    const { data, error } = await getEphemeralClient().auth.signUp({
      email: email.trim(), password,
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    if (error) throw new Error(error.message)
    if (!data.user) throw new Error('Employee account was not created.')
    let roleAssigned = false
    try {
      await api.applyRole(data.user.id, role)
      roleAssigned = true
    } catch {
      roleAssigned = false
    }
    return { password, roleAssigned }
  },
  getSettings: async (): Promise<StoreSettings> => {
    const rows = await unwrap<StoreSettings[]>(getSupabase().from('store_settings').select('*').limit(1) as unknown as PromiseLike<Query>)
    if (!rows.length) throw new Error('Store settings are missing. Apply migration 00004.')
    return rows[0]
  },
  saveSettings: (settings: Partial<StoreSettings>) => {
    const { id, updated_at: _updated, ...payload } = settings
    void _updated
    return table<StoreSettings>('store_settings').save({ ...payload, ...(id ? { id } : {}) })
  },
  listAudit: () => table<AuditLog>('audit_logs').list(),

  // Reports -----------------------------------------------------------------
  dashboardStats: () => rpc<Record<string, unknown>>('dashboard_stats'),
  salesReport: (from: string, to: string) => rpc<Record<string, unknown>>('sales_report', { p_from: from, p_to: to }),
  inventoryReport: () => rpc<Record<string, unknown>>('inventory_report'),
}

export type { CustomerHistory }
