-- 00004_seed_reference.sql
-- Reference data only. No users, no passwords, no credentials.
-- Every insert is idempotent.

insert into public.roles (name, permissions, description)
values
  (
    'owner',
    '["*"]'::jsonb,
    'Full access including users, settings, audit log and profit reports'
  ),
  (
    'admin',
    '[
      "pos.access",
      "products.view", "products.create", "products.edit", "products.delete",
      "inventory.view", "inventory.receive", "inventory.adjust", "inventory.audit",
      "sales.view", "invoices.view", "invoices.print", "held_carts.manage",
      "customers.view", "customers.create", "customers.edit", "customers.delete",
      "suppliers.view", "suppliers.create", "suppliers.edit",
      "purchases.view", "purchases.create", "purchases.edit",
      "expenses.view", "expenses.create", "expenses.edit",
      "reports.view", "reports.inventory", "dashboard.view",
      "serials.view", "serials.manage", "returns.approve", "returns.request",
      "cash.manage"
    ]'::jsonb,
    'Store manager. Cannot manage users, edit settings, view audit logs or see profit'
  ),
  (
    'sales',
    '[
      "pos.access", "products.view",
      "customers.view", "customers.create", "customers.edit",
      "sales.view", "invoices.view", "invoices.print", "held_carts.manage",
      "cash.manage", "returns.request", "dashboard.view"
    ]'::jsonb,
    'Cashier / sales associate'
  ),
  (
    'inventory',
    '[
      "inventory.view", "inventory.receive", "inventory.adjust", "inventory.audit",
      "serials.view", "serials.manage", "products.view",
      "reports.inventory", "dashboard.view", "suppliers.view", "purchases.view"
    ]'::jsonb,
    'Stock keeper'
  )
on conflict (name) do nothing;

insert into public.store_settings (
  is_default, store_name, currency, currency_symbol, tax_rate,
  invoice_prefix, warranty_default_months, invoice_layout, timezone
)
values (
  true,
  'Macintosh BD',
  'BDT',
  '৳',
  0,
  'MB',
  12,
  'a4',
  'Asia/Dhaka'
)
on conflict (is_default) do nothing;
