-- 00001_schema.sql
-- Core schema for Macintosh BD POS.
-- PostgreSQL 14+ / Supabase compatible.
-- Safe to run in the Supabase SQL editor as the postgres/service_role owner.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Supabase compatibility shims for local/plain PostgreSQL.
-- On Supabase these are no-ops: auth.users and auth.uid() already exist.
-- ---------------------------------------------------------------------------
-- On Supabase the `auth` schema is managed (owned by `supabase_auth_admin`); do not require
-- CREATE on it. Only create `auth` on plain PostgreSQL, and never fail if not permitted.
do $schema_auth$
begin
  if to_regnamespace('auth') is null then
    execute 'create schema auth';
  end if;
exception when insufficient_privilege then
  null;
end
$schema_auth$;

-- Supabase always has these roles. Create them on plain local PostgreSQL so
-- the migrations and the test script can be applied outside Supabase too.
do $roles_shim$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'create role anon nologin';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create role authenticated nologin';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'create role service_role nologin bypassrls';
  end if;
end
$roles_shim$;

-- On Supabase `auth.users` is managed and already exists; PostgreSQL would still check
-- CREATE on schema `auth` for `create table if not exists`, so guard on existence first.
-- Only create this table on plain PostgreSQL; never require privileges on managed `auth`.
do $users_shim$
begin
  if to_regclass('auth.users') is null then
    execute $users_ddl$
      create table auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    $users_ddl$;
  end if;
exception when insufficient_privilege then
  null;
end
$users_shim$;

do $auth_shim$
begin
  if to_regprocedure('auth.uid()') is null then
    execute $uid_fn$
      create function auth.uid()
      returns uuid
      language sql
      stable
      as $uid_body$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $uid_body$
    $uid_fn$;
  end if;
exception when insufficient_privilege then
  null;
end
$auth_shim$;

grant usage on schema public to anon, authenticated;
-- `auth` schema + `auth.uid()` are managed on Supabase (already granted); only attempt
-- these on plain PostgreSQL where we created the shims, and never require ownership.
do $auth_grants$
begin
  begin
    grant usage on schema auth to anon, authenticated;
  exception when insufficient_privilege then null; end;
  if to_regprocedure('auth.uid()') is not null then
    begin
      grant execute on function auth.uid() to anon, authenticated;
    exception when insufficient_privilege then null; end;
  end if;
end
$auth_grants$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid()
    references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role text not null default 'sales'
    check (role in ('owner', 'admin', 'sales', 'inventory')),
  is_active boolean not null default true,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  permissions jsonb not null default '{}'::jsonb,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  id uuid primary key default gen_random_uuid(),
  store_name text not null default 'Macintosh BD',
  logo_url text,
  address text,
  phone text,
  email text,
  currency text default 'BDT',
  currency_symbol text default '৳',
  tax_rate numeric(6,2) default 0 check (tax_rate >= 0),
  invoice_prefix text default 'MB',
  warranty_default_months integer default 12 check (warranty_default_months >= 0),
  receipt_footer text,
  invoice_layout text default 'a4',
  timezone text default 'Asia/Dhaka',
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint store_settings_singleton_uq unique (is_default),
  constraint store_settings_singleton_chk check (is_default),
  constraint store_settings_invoice_prefix_chk
    check (invoice_prefix ~ '^[A-Za-z0-9_-]{1,10}$')
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  parent_id uuid references public.categories(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  credit_limit numeric(14,2) default 0 check (credit_limit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_id uuid references public.brands(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  sku text not null unique,
  barcode text unique,
  model text,
  description text,
  condition text not null default 'new'
    check (condition in ('new', 'used', 'refurbished')),
  product_type text,
  purchase_price numeric(14,2) default 0 check (purchase_price >= 0),
  selling_price numeric(14,2) not null check (selling_price >= 0),
  min_selling_price numeric(14,2) default 0 check (min_selling_price >= 0),
  stock_quantity numeric(12,3) not null default 0 check (stock_quantity >= 0),
  reorder_level numeric(12,3) not null default 0 check (reorder_level >= 0),
  image_url text,
  warranty_months integer default 12 check (warranty_months >= 0),
  supplier_id uuid references public.suppliers(id) on delete set null,
  is_serialized boolean not null default false,
  is_active boolean not null default true,
  is_archived boolean not null default false,
  cpu text,
  cpu_generation text,
  ram text,
  ram_type text,
  storage_capacity text,
  storage_type text,
  gpu text,
  display_size text,
  resolution text,
  refresh_rate text,
  touchscreen boolean default false,
  operating_system text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  constraint products_min_le_selling_chk
    check (min_selling_price <= selling_price)
);

-- product_serials references sales, which is created later; those two FKs are
-- added at the end of this file.
create table if not exists public.product_serials (
  id uuid primary key default gen_random_uuid(),
  serial_number text not null unique,
  product_id uuid not null references public.products(id) on delete cascade,
  purchase_price numeric(14,2) check (purchase_price >= 0),
  purchase_date date,
  supplier_id uuid references public.suppliers(id) on delete set null,
  warranty_months integer check (warranty_months >= 0),
  warranty_expiry date,
  condition text,
  location text,
  status text not null default 'in_stock'
    check (status in ('in_stock', 'reserved', 'sold', 'returned', 'repair', 'defective')),
  sale_id uuid,
  customer_id uuid,
  sold_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  reference text,
  purchase_date date not null default current_date,
  subtotal numeric(14,2) default 0 check (subtotal >= 0),
  discount numeric(14,2) default 0 check (discount >= 0),
  tax numeric(14,2) default 0 check (tax >= 0),
  total numeric(14,2) default 0 check (total >= 0),
  paid numeric(14,2) default 0 check (paid >= 0),
  due numeric(14,2) default 0 check (due >= 0),
  status text default 'received'
    check (status in ('draft', 'received', 'partial', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  serial_numbers text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_id uuid references public.purchases(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  method text,
  reference text,
  paid_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0),
  tax numeric(14,2) not null default 0 check (tax >= 0),
  delivery numeric(14,2) not null default 0 check (delivery >= 0),
  total numeric(14,2) not null check (total >= 0),
  paid numeric(14,2) not null default 0 check (paid >= 0),
  due numeric(14,2) not null default 0 check (due >= 0),
  status text not null default 'completed'
    check (status in ('completed', 'returned', 'cancelled')),
  notes text,
  sale_date timestamptz not null default now(),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  serial_id uuid references public.product_serials(id) on delete set null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  discount numeric(14,2) default 0 check (discount >= 0),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  warranty_months integer default 0 check (warranty_months >= 0),
  product_name text,
  serial_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  method text not null,
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  paid_at timestamptz default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.held_carts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  customer_id uuid references public.customers(id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  discount numeric(14,2) default 0 check (discount >= 0),
  tax numeric(14,2) default 0 check (tax >= 0),
  delivery numeric(14,2) default 0 check (delivery >= 0),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  movement_type text not null
    check (movement_type in ('purchase', 'sale', 'adjustment', 'damage', 'return', 'audit')),
  quantity numeric(12,3) not null,
  previous_quantity numeric(12,3) not null check (previous_quantity >= 0),
  new_quantity numeric(12,3) not null check (new_quantity >= 0),
  reference text,
  reason text,
  employee_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null
    check (category in ('rent', 'salary', 'electricity', 'internet', 'transport',
                        'food', 'repair', 'marketing', 'other')),
  amount numeric(14,2) not null check (amount > 0),
  description text,
  expense_date date not null default current_date,
  payment_method text,
  employee_id uuid references public.profiles(id) on delete set null,
  receipt_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.returns (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  reason text not null,
  refund_amount numeric(14,2) default 0 check (refund_amount >= 0),
  exchange_amount numeric(14,2) default 0 check (exchange_amount >= 0),
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.returns(id) on delete cascade,
  sale_item_id uuid references public.sale_items(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  serial_id uuid references public.product_serials(id) on delete set null,
  quantity numeric(12,3) not null check (quantity > 0),
  condition text,
  restocked boolean default false,
  restock_approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warranty_claims (
  id uuid primary key default gen_random_uuid(),
  serial_id uuid references public.product_serials(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  claim_date date not null default current_date,
  issue text not null,
  status text default 'open' check (status in ('open', 'in_progress', 'resolved', 'rejected')),
  resolution text,
  repair_cost numeric(14,2) default 0 check (repair_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.cash_shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete restrict,
  opened_at timestamptz default now(),
  opening_balance numeric(14,2) not null default 0 check (opening_balance >= 0),
  expected_closing numeric(14,2) check (expected_closing >= 0),
  actual_closing numeric(14,2) check (actual_closing >= 0),
  difference numeric(14,2),
  closed_at timestamptz,
  status text default 'open' check (status in ('open', 'closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.cash_shifts(id) on delete cascade,
  movement_type text not null
    check (movement_type in ('cash_in', 'cash_out', 'sale', 'expense', 'refund')),
  amount numeric(14,2) not null check (amount > 0),
  reference text,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  table_name text,
  record_id uuid,
  old_data jsonb,
  new_data jsonb,
  ip text,
  created_at timestamptz default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Circular / late FKs
-- ---------------------------------------------------------------------------
do $late_fks$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_serials_sale_id_fkey'
  ) then
    alter table public.product_serials
      add constraint product_serials_sale_id_fkey
      foreign key (sale_id) references public.sales(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'product_serials_customer_id_fkey'
  ) then
    alter table public.product_serials
      add constraint product_serials_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete set null;
  end if;
end
$late_fks$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_profiles_role_active on public.profiles(role, is_active);
create index if not exists idx_profiles_created_by on public.profiles(created_by);

create index if not exists idx_categories_parent on public.categories(parent_id);
create index if not exists idx_categories_active on public.categories(is_active);
create index if not exists idx_brands_active on public.brands(is_active);

create index if not exists idx_customers_phone on public.customers(phone);
create index if not exists idx_customers_active on public.customers(is_active);
create index if not exists idx_suppliers_phone on public.suppliers(phone);
create index if not exists idx_suppliers_active on public.suppliers(is_active);

create index if not exists idx_products_brand on public.products(brand_id);
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_supplier on public.products(supplier_id);
create index if not exists idx_products_active_archived on public.products(is_active, is_archived);
create index if not exists idx_products_stock on public.products(stock_quantity);
create index if not exists idx_products_reorder on public.products(reorder_level);
create index if not exists idx_products_created_at on public.products(created_at);

create index if not exists idx_product_serials_product on public.product_serials(product_id);
create index if not exists idx_product_serials_status on public.product_serials(status);
create index if not exists idx_product_serials_sale on public.product_serials(sale_id);
create index if not exists idx_product_serials_customer on public.product_serials(customer_id);

create index if not exists idx_purchases_supplier on public.purchases(supplier_id);
create index if not exists idx_purchases_date on public.purchases(purchase_date);
create index if not exists idx_purchases_status on public.purchases(status);
create index if not exists idx_purchase_items_purchase on public.purchase_items(purchase_id);
create index if not exists idx_purchase_items_product on public.purchase_items(product_id);
create index if not exists idx_supplier_payments_supplier on public.supplier_payments(supplier_id);
create index if not exists idx_supplier_payments_purchase on public.supplier_payments(purchase_id);

create index if not exists idx_sales_customer on public.sales(customer_id);
create index if not exists idx_sales_employee on public.sales(employee_id);
create index if not exists idx_sales_sale_date on public.sales(sale_date);
create index if not exists idx_sales_status on public.sales(status);
create index if not exists idx_sale_items_sale on public.sale_items(sale_id);
create index if not exists idx_sale_items_product on public.sale_items(product_id);
create index if not exists idx_sale_items_serial on public.sale_items(serial_id);
create index if not exists idx_sale_payments_sale on public.sale_payments(sale_id);

create index if not exists idx_held_carts_creator on public.held_carts(created_by);
create index if not exists idx_stock_movements_product on public.stock_movements(product_id);
create index if not exists idx_stock_movements_created_at on public.stock_movements(created_at);
create index if not exists idx_expenses_category_date on public.expenses(category, expense_date);
create index if not exists idx_expenses_created_by on public.expenses(created_by);

create index if not exists idx_returns_sale on public.returns(sale_id);
create index if not exists idx_returns_status on public.returns(status);
create index if not exists idx_return_items_return on public.return_items(return_id);
create index if not exists idx_return_items_sale_item on public.return_items(sale_item_id);
create index if not exists idx_return_items_product on public.return_items(product_id);
create index if not exists idx_return_items_serial on public.return_items(serial_id);

create index if not exists idx_warranty_claims_serial on public.warranty_claims(serial_id);
create index if not exists idx_warranty_claims_product on public.warranty_claims(product_id);
create index if not exists idx_warranty_claims_customer on public.warranty_claims(customer_id);
create index if not exists idx_warranty_claims_status on public.warranty_claims(status);

create index if not exists idx_cash_shifts_employee on public.cash_shifts(employee_id);
create index if not exists idx_cash_shifts_status on public.cash_shifts(status);
create index if not exists idx_cash_movements_shift on public.cash_movements(shift_id);
create index if not exists idx_cash_movements_type on public.cash_movements(movement_type);

create index if not exists idx_audit_logs_user on public.audit_logs(user_id);
create index if not exists idx_audit_logs_table_record on public.audit_logs(table_name, record_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);
