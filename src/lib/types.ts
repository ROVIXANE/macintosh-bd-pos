export type Role = 'owner' | 'admin' | 'sales' | 'inventory'

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  role: Role
  is_active: boolean
  avatar_url: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface Category {
  id: string
  name: string
  description: string | null
  parent_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface Brand {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface Supplier {
  id: string
  name: string
  company: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

export interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  credit_limit: number
  is_active: boolean
  created_at: string
  updated_at: string
  created_by: string | null
}

export type ProductCondition = 'new' | 'used' | 'refurbished'

export interface Product {
  id: string
  name: string
  brand_id: string | null
  category_id: string | null
  sku: string
  barcode: string | null
  model: string | null
  description: string | null
  condition: ProductCondition
  product_type: string | null
  purchase_price: number
  selling_price: number
  min_selling_price: number
  stock_quantity: number
  reorder_level: number
  image_url: string | null
  warranty_months: number
  supplier_id: string | null
  is_serialized: boolean
  is_active: boolean
  is_archived: boolean
  cpu: string | null
  cpu_generation: string | null
  ram: string | null
  ram_type: string | null
  storage_capacity: string | null
  storage_type: string | null
  gpu: string | null
  display_size: string | null
  resolution: string | null
  refresh_rate: string | null
  touchscreen: boolean
  operating_system: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  updated_by: string | null
}

export type ProductInput = Omit<
  Product,
  'id' | 'created_at' | 'updated_at' | 'stock_quantity' | 'is_archived'
> & { id?: string }

export type SerialStatus = 'in_stock' | 'reserved' | 'sold' | 'returned' | 'repair' | 'defective'

export interface ProductSerial {
  id: string
  serial_number: string
  product_id: string
  purchase_price: number | null
  purchase_date: string | null
  supplier_id: string | null
  warranty_months: number | null
  warranty_expiry: string | null
  condition: ProductCondition | null
  location: string | null
  status: SerialStatus
  sale_id: string | null
  customer_id: string | null
  sold_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  product?: Pick<Product, 'id' | 'name' | 'sku' | 'selling_price'>
  supplier?: Pick<Supplier, 'id' | 'name'>
}

export interface StockMovement {
  id: string
  product_id: string
  movement_type: 'purchase' | 'sale' | 'adjustment' | 'damage' | 'return' | 'audit'
  quantity: number
  previous_quantity: number
  new_quantity: number
  reference: string | null
  reason: string | null
  employee_id: string | null
  created_at: string
  updated_at: string
  product?: Pick<Product, 'id' | 'name' | 'sku'>
  employee?: Pick<Profile, 'id' | 'full_name'>
}

export interface CartItem {
  product_id: string
  name: string
  sku: string
  quantity: number
  unit_price: number
  discount: number
  serial_id?: string | null
  serial_number?: string | null
  warranty_months: number
  available_stock: number
  is_serialized?: boolean
}

export interface PaymentInput {
  method: 'cash' | 'card' | 'bkash' | 'nagad' | 'rocket' | 'bank'
  amount: number
  reference?: string
}

export interface CheckoutInput {
  items: CartItem[]
  customer_id: string | null
  payments: PaymentInput[]
  discount: number
  tax: number
  delivery: number
  warranty_months: number
  idempotency_key: string
  held_cart_id?: string | null
}

export interface CheckoutResult {
  sale_id: string
  invoice_number: string
  total: number
  paid: number
  due: number
}

export interface Sale {
  id: string
  invoice_number: string
  customer_id: string | null
  employee_id: string
  subtotal: number
  discount: number
  tax: number
  delivery: number
  total: number
  paid: number
  due: number
  status: 'completed' | 'returned' | 'cancelled'
  notes: string | null
  sale_date: string
  idempotency_key: string | null
  customer?: Pick<Customer, 'id' | 'name' | 'phone'> | null
  employee?: Pick<Profile, 'id' | 'full_name'> | null
  items?: SaleItem[]
  payments?: SalePayment[]
}

export interface SaleItem {
  id: string
  sale_id: string
  product_id: string
  serial_id: string | null
  quantity: number
  unit_price: number
  discount: number
  subtotal: number
  warranty_months: number
  product_name: string | null
  serial_number: string | null
  product?: Pick<Product, 'id' | 'name' | 'sku'>
}

export interface SalePayment {
  id: string
  sale_id: string
  method: string
  amount: number
  reference: string | null
  paid_at: string
}

export interface HeldCart {
  id: string
  name: string
  customer_id: string | null
  items: CartItem[]
  discount: number
  tax: number
  delivery: number
  created_by: string
  created_at: string
  customer?: Pick<Customer, 'id' | 'name'> | null
}

export interface Purchase {
  id: string
  supplier_id: string | null
  reference: string | null
  purchase_date: string
  subtotal: number
  discount: number
  tax: number
  total: number
  paid: number
  due: number
  status: string
  notes: string | null
  created_at: string
  supplier?: Pick<Supplier, 'id' | 'name' | 'company'> | null
  items?: PurchaseItem[]
}

export interface PurchaseItem {
  id: string
  purchase_id: string
  product_id: string
  quantity: number
  unit_cost: number
  subtotal: number
  serial_numbers: string[] | null
  product?: Pick<Product, 'id' | 'name' | 'sku'>
}

export interface SupplierPayment {
  id: string
  supplier_id: string
  purchase_id: string | null
  amount: number
  method: string | null
  reference: string | null
  paid_at: string
  created_at: string
}

export interface Expense {
  id: string
  category: string
  amount: number
  description: string | null
  expense_date: string
  payment_method: string | null
  employee_id: string | null
  receipt_url: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  employee?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface ReturnRecord {
  id: string
  sale_id: string
  customer_id: string | null
  reason: string
  refund_amount: number
  exchange_amount: number
  status: 'pending' | 'approved' | 'rejected'
  approved_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  sale?: Pick<Sale, 'id' | 'invoice_number' | 'total'>
  customer?: Pick<Customer, 'id' | 'name'> | null
  items?: ReturnItem[]
}

export interface ReturnItem {
  id: string
  return_id: string
  sale_item_id: string | null
  product_id: string
  serial_id: string | null
  quantity: number
  condition: string | null
  restocked: boolean
  restock_approved_by: string | null
  created_at: string
  updated_at: string
  product?: Pick<Product, 'id' | 'name' | 'sku'>
}

export interface WarrantyClaim {
  id: string
  serial_id: string | null
  product_id: string
  customer_id: string | null
  sale_id: string | null
  claim_date: string
  issue: string
  status: 'open' | 'in_progress' | 'resolved' | 'rejected'
  resolution: string | null
  repair_cost: number
  created_at: string
  updated_at: string
  created_by: string | null
  product?: Pick<Product, 'id' | 'name' | 'sku'>
  customer?: Pick<Customer, 'id' | 'name' | 'phone'> | null
  serial?: Pick<ProductSerial, 'id' | 'serial_number'> | null
}

export interface CashShift {
  id: string
  employee_id: string
  opened_at: string
  opening_balance: number
  expected_closing: number | null
  actual_closing: number | null
  difference: number | null
  closed_at: string | null
  status: 'open' | 'closed'
  notes: string | null
  created_at: string
  updated_at: string
  employee?: Pick<Profile, 'id' | 'full_name'>
}

export interface CashMovement {
  id: string
  shift_id: string
  movement_type: 'cash_in' | 'cash_out' | 'sale' | 'expense' | 'refund'
  amount: number
  reference: string | null
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  table_name: string | null
  record_id: string | null
  old_data: unknown
  new_data: unknown
  ip: string | null
  created_at: string
  updated_at: string
}

export interface StoreSettings {
  id: string
  store_name: string
  logo_url: string | null
  address: string | null
  phone: string | null
  email: string | null
  currency: string
  currency_symbol: string
  tax_rate: number
  invoice_prefix: string
  warranty_default_months: number
  receipt_footer: string | null
  invoice_layout: string
  timezone: string
  is_default: boolean
  created_at: string
  updated_at: string
}

/** Keys returned by public.dashboard_stats() in 00003_functions.sql. */
export interface DashboardStats {
  today_sales_count: number
  today_sales_sum: number
  month_sales_sum: number
  products_sold: number
  inventory_value: number
  low_stock_count: number
  out_of_stock_count: number
  customer_due_sum: number
  supplier_due_sum: number
  today_expenses: number
}

export interface CustomerHistory {
  customer: Customer
  sales: Sale[]
  returns: ReturnRecord[]
}

export interface ApiError extends Error {
  code?: string
}
