# Supabase setup for Macintosh BD POS

All SQL lives under `supabase/`. Apply files in filename order. There are no
passwords, default admin users or secrets in these migrations.

## Apply migrations in the Supabase SQL editor

1. Open your project in the Supabase dashboard and go to **SQL Editor**.
2. Create a new query for each file below.
3. Paste the entire file contents and click **Run**. Do not split a file across
   runs; the functions use dollar-quoted bodies.
4. Wait for `Success. No rows returned` (or the seed insert counts) before
   running the next file.

| Order | File | Purpose |
| --- | --- | --- |
| 1 | `migrations/00001_schema.sql` | Tables, constraints, indexes, Supabase compatibility shims |
| 2 | `migrations/00002_rls_policies.sql` | RLS on every table + policies; adds a small `rls_current_role()` helper |
| 3 | `migrations/00003_functions.sql` | Permission API, transactional RPCs, triggers, reports, grants |
| 4 | `migrations/00004_seed_reference.sql` | Idempotent `roles` and singleton `store_settings` rows |

If you prefer the CLI, use the Supabase CLI and put these files in a linked
project; the same numeric order applies. Each file is written to be runnable on
its own after the previous ones.

### First-time owner setup

Auth users get a `profiles` row with role `sales` via an `auth.users` trigger.
After signing in with the very first user, call:

```sql
select public.bootstrap_owner();
```

This promotes the caller to `owner` **only** when no active owner exists. After
that it always fails. Owners can then use:

```sql
select public.apply_role('<user-uuid>', 'admin');
select public.set_profile_active('<user-uuid>', false);
```

Owners cannot be demoted and you cannot deactivate yourself.

## Verification queries

Run these read-only checks after applying all four migrations:

```sql
-- Every public table must have RLS enabled.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

```sql
-- Required RPC signatures.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'has_permission', 'current_role', 'checkout', 'receive_purchase',
    'adjust_stock', 'process_return', 'create_cash_shift',
    'close_cash_shift', 'cash_movement', 'apply_role',
    'set_profile_active', 'bootstrap_owner', 'dashboard_stats',
    'sales_report', 'inventory_report'
  )
order by p.proname;
```

```sql
-- Security-definer functions must have a pinned search_path.
select p.proname, p.prosecdef, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('checkout', 'receive_purchase', 'adjust_stock',
                    'has_permission', 'bootstrap_owner')
order by p.proname;
```

```sql
-- Reference seed data.
select name, permissions from public.roles order by name;
select store_name, invoice_prefix, currency, currency_symbol
from public.store_settings;
```

```sql
-- Permission matrix smoke test with a known user id.
select public.has_permission('pos.access', '<user-uuid>') as pos,
       public.has_permission('inventory.adjust', '<user-uuid>') as adjust,
       public.has_permission('reports.profit', '<user-uuid>') as profit,
       public.has_permission('audit.view', '<user-uuid>') as audit;
```

```sql
-- Live RPC checks (use real ids/values for your store).
select public.dashboard_stats();
select public.inventory_report();
select public.sales_report(current_date - 30, current_date);
```

## Transaction tests

`tests/rls_and_transaction_tests.sql` is a commented, runnable SQL suite that
asserts:

- anon cannot read customers;
- sales cannot adjust stock;
- duplicate serial numbers fail;
- checkout over stock fails;
- negative stock updates fail;
- non-owners (sales and admin) cannot call `apply_role`;
- an idempotent checkout returns the same invoice and creates one sale.

It wraps everything in `BEGIN` / `ROLLBACK`, so it does not persist changes.
**Run it only in a local or development database with a service_role/postgres
session. Never run it against production data.**

## Rollback notes

There are intentionally no `down` migration files. PostgreSQL DDL is
transactional, so ideally paste each migration inside:

```sql
begin;
-- file contents
rollback;  -- or commit; when you are sure
```

If a migration has already been committed and must be undone:

- Do **not** try to drop tables one by one without planning: FK dependencies
  will block you. Drop in reverse dependency order, starting with triggers and
  functions that reference tables, then child tables, then parents.
- `00003_functions.sql` can be re-applied with `create or replace`; its trigger
  setup uses `drop trigger if exists` first.
- `00002_rls_policies.sql` does **not** use `if not exists` for policies. To
  re-apply it, drop the existing policies first or restore from a backup.
- `00004_seed_reference.sql` is safe to re-run because it uses
  `on conflict do nothing`.
- The safest rollback on a real project is a point-in-time restore or a fresh
  database followed by re-applying 00001 -> 00004.

## Frontend RPC calls

Use `supabase.rpc(...)` rather than direct writes for money and stock:
`checkout`, `receive_purchase`, `adjust_stock`, `process_return`,
`create_cash_shift`, `close_cash_shift`, `cash_movement`, `dashboard_stats`,
`sales_report`, and `inventory_report`. Direct client writes to `sales`,
`sale_items` and `sale_payments` are blocked by RLS so totals cannot be forged.
