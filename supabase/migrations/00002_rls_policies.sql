-- 00002_rls_policies.sql
-- Row Level Security for every public table.
--
-- This file intentionally defines one tiny RLS-only helper before the policies
-- so it can be applied before 00003_functions.sql and so profile policies do
-- not recurse into themselves. 00003 replaces this with the full permission
-- API (has_permission/current_role) used by the application.

create or replace function public.rls_current_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $rls_role$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active
$rls_role$;

revoke all on function public.rls_current_role() from public;
grant execute on function public.rls_current_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges. RLS still decides which rows are visible.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from public, anon, authenticated;
grant select on public.roles, public.store_settings to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.roles             enable row level security;
alter table public.store_settings    enable row level security;
alter table public.categories        enable row level security;
alter table public.brands            enable row level security;
alter table public.customers         enable row level security;
alter table public.suppliers         enable row level security;
alter table public.products          enable row level security;
alter table public.product_serials   enable row level security;
alter table public.purchases         enable row level security;
alter table public.purchase_items    enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.sales             enable row level security;
alter table public.sale_items        enable row level security;
alter table public.sale_payments     enable row level security;
alter table public.held_carts        enable row level security;
alter table public.stock_movements   enable row level security;
alter table public.expenses          enable row level security;
alter table public.returns           enable row level security;
alter table public.return_items      enable row level security;
alter table public.warranty_claims   enable row level security;
alter table public.cash_shifts       enable row level security;
alter table public.cash_movements    enable row level security;
alter table public.audit_logs        enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_privileged on public.profiles
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin'));

create policy profiles_insert_owner on public.profiles
  for insert to authenticated
  with check (public.rls_current_role() = 'owner');

create policy profiles_update_owner on public.profiles
  for update to authenticated
  using (public.rls_current_role() = 'owner')
  with check (public.rls_current_role() = 'owner');

create policy profiles_delete_owner on public.profiles
  for delete to authenticated
  using (public.rls_current_role() = 'owner');

-- ---------------------------------------------------------------------------
-- roles and store_settings: legitimate public reference reads
-- ---------------------------------------------------------------------------
create policy roles_reference_read on public.roles
  for select to anon, authenticated
  using (true);

create policy roles_owner_manage on public.roles
  for all to authenticated
  using (public.rls_current_role() = 'owner')
  with check (public.rls_current_role() = 'owner');

create policy store_settings_reference_read on public.store_settings
  for select to anon, authenticated
  using (true);

create policy store_settings_owner_manage on public.store_settings
  for all to authenticated
  using (public.rls_current_role() = 'owner')
  with check (public.rls_current_role() = 'owner');

-- ---------------------------------------------------------------------------
-- Catalog reference data
-- ---------------------------------------------------------------------------
create policy categories_read on public.categories
  for select to authenticated
  using (is_active or public.rls_current_role() in ('owner', 'admin', 'inventory'));

create policy categories_manage on public.categories
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin'))
  with check (public.rls_current_role() in ('owner', 'admin'));

create policy brands_read on public.brands
  for select to authenticated
  using (is_active or public.rls_current_role() in ('owner', 'admin', 'inventory'));

create policy brands_manage on public.brands
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin'))
  with check (public.rls_current_role() in ('owner', 'admin'));

create policy products_read on public.products
  for select to authenticated
  using (
    (is_active and not is_archived)
    or public.rls_current_role() in ('owner', 'admin', 'inventory')
  );

create policy products_manage on public.products
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'inventory'))
  with check (public.rls_current_role() in ('owner', 'admin', 'inventory'));

create policy serials_read on public.product_serials
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'inventory'));

create policy serials_manage on public.product_serials
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'inventory'))
  with check (public.rls_current_role() in ('owner', 'admin', 'inventory'));

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create policy customers_read on public.customers
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'sales'));

create policy customers_insert on public.customers
  for insert to authenticated
  with check (public.rls_current_role() in ('owner', 'admin', 'sales'));

create policy customers_update on public.customers
  for update to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'sales'))
  with check (public.rls_current_role() in ('owner', 'admin', 'sales'));

create policy customers_delete on public.customers
  for delete to authenticated
  using (public.rls_current_role() in ('owner', 'admin'));

create policy suppliers_read on public.suppliers
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'inventory'));

create policy suppliers_manage on public.suppliers
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'inventory'))
  with check (public.rls_current_role() in ('owner', 'admin', 'inventory'));

-- ---------------------------------------------------------------------------
-- Purchasing
-- ---------------------------------------------------------------------------
create policy purchases_read on public.purchases
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'inventory'));

create policy purchases_manage on public.purchases
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'inventory'))
  with check (public.rls_current_role() in ('owner', 'admin', 'inventory'));

create policy purchase_items_read on public.purchase_items
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'inventory'));

create policy purchase_items_manage on public.purchase_items
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'inventory'))
  with check (public.rls_current_role() in ('owner', 'admin', 'inventory'));

create policy supplier_payments_read on public.supplier_payments
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'inventory'));

create policy supplier_payments_manage on public.supplier_payments
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'inventory'))
  with check (public.rls_current_role() in ('owner', 'admin', 'inventory'));

-- ---------------------------------------------------------------------------
-- Sales. Writes normally go through security-definer RPCs; direct client
-- writes are restricted to owner/admin so totals cannot be forged.
-- ---------------------------------------------------------------------------
create policy sales_read on public.sales
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'sales'));

create policy sales_manage on public.sales
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin'))
  with check (public.rls_current_role() in ('owner', 'admin'));

create policy sale_items_read on public.sale_items
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'sales'));

create policy sale_items_manage on public.sale_items
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin'))
  with check (public.rls_current_role() in ('owner', 'admin'));

create policy sale_payments_read on public.sale_payments
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'sales'));

create policy sale_payments_manage on public.sale_payments
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin'))
  with check (public.rls_current_role() in ('owner', 'admin'));

create policy held_carts_owner on public.held_carts
  for all to authenticated
  using (created_by = auth.uid() or public.rls_current_role() in ('owner', 'admin'))
  with check (created_by = auth.uid() or public.rls_current_role() in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Stock, expenses, returns, warranty
-- ---------------------------------------------------------------------------
create policy stock_movements_read on public.stock_movements
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'inventory'));

create policy stock_movements_manage on public.stock_movements
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'inventory'))
  with check (public.rls_current_role() in ('owner', 'admin', 'inventory'));

create policy expenses_read on public.expenses
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin'));

create policy expenses_manage on public.expenses
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin'))
  with check (public.rls_current_role() in ('owner', 'admin'));

create policy returns_read on public.returns
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'sales'));

create policy returns_manage on public.returns
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin'))
  with check (public.rls_current_role() in ('owner', 'admin'));

create policy return_items_read on public.return_items
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'sales'));

create policy return_items_manage on public.return_items
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin'))
  with check (public.rls_current_role() in ('owner', 'admin'));

create policy warranty_claims_read on public.warranty_claims
  for select to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'sales', 'inventory'));

create policy warranty_claims_insert on public.warranty_claims
  for insert to authenticated
  with check (public.rls_current_role() in ('owner', 'admin', 'sales'));

create policy warranty_claims_update on public.warranty_claims
  for update to authenticated
  using (public.rls_current_role() in ('owner', 'admin', 'sales'))
  with check (public.rls_current_role() in ('owner', 'admin', 'sales'));

create policy warranty_claims_delete on public.warranty_claims
  for delete to authenticated
  using (public.rls_current_role() in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Cash drawer
-- ---------------------------------------------------------------------------
create policy cash_shifts_read on public.cash_shifts
  for select to authenticated
  using (
    employee_id = auth.uid()
    or public.rls_current_role() in ('owner', 'admin')
  );

create policy cash_shifts_manage on public.cash_shifts
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin'))
  with check (public.rls_current_role() in ('owner', 'admin'));

create policy cash_movements_read on public.cash_movements
  for select to authenticated
  using (
    public.rls_current_role() in ('owner', 'admin')
    or exists (
      select 1 from public.cash_shifts cs
      where cs.id = cash_movements.shift_id
        and cs.employee_id = auth.uid()
    )
  );

create policy cash_movements_manage on public.cash_movements
  for all to authenticated
  using (public.rls_current_role() in ('owner', 'admin'))
  with check (public.rls_current_role() in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- Audit log is owner-only. Admins are deliberately excluded.
-- ---------------------------------------------------------------------------
create policy audit_logs_owner_read on public.audit_logs
  for select to authenticated
  using (public.rls_current_role() = 'owner');
