-- rls_and_transaction_tests.sql
--
-- WARNING: RUN ONLY IN A LOCAL / DEVELOPMENT DATABASE WITH A SERVICE_ROLE
-- (or postgres superuser) SESSION. DO NOT RUN AGAINST PRODUCTION WITH REAL DATA.
--
-- Apply migrations 00001 -> 00004 first (00004 seeds store_settings, which
-- makes the invoice-prefix assertion deterministic, though checkout also has
-- a built-in 'MB' fallback).
--
-- The whole script is wrapped in BEGIN / ROLLBACK: fixtures are created inside
-- the transaction and every change is discarded at the end. Each assertion is
-- a DO block that raises an exception on failure. Expected failures are caught
-- and asserted, then the session role is restored before the next block.
--
-- Run with:  psql "$DATABASE_URL" -f supabase/tests/rls_and_transaction_tests.sql
-- (or paste into the Supabase SQL editor while signed in as the postgres role).

begin;

-- ---------------------------------------------------------------------------
-- Fixtures (service_role / postgres context)
-- ---------------------------------------------------------------------------
do $fixture$
declare
  v_owner uuid := gen_random_uuid();
  v_sales uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_supplier uuid := gen_random_uuid();
  v_customer uuid := gen_random_uuid();
  v_product uuid := gen_random_uuid();
  v_oos_product uuid := gen_random_uuid();
  v_serial_product uuid := gen_random_uuid();
  v_serial uuid := gen_random_uuid();
  v_item jsonb;
begin
  create temp table if not exists tmp_pos_tests (
    privileged_role text,
    owner_id uuid,
    sales_id uuid,
    admin_id uuid,
    supplier_id uuid,
    customer_id uuid,
    product_id uuid,
    oos_product_id uuid,
    serial_product_id uuid,
    serial_id uuid,
    idempotency_key text
  );
  delete from tmp_pos_tests;

  -- auth.users rows are needed because profiles.id is an FK to auth.users.
  insert into auth.users (id, email, raw_user_meta_data)
  values
    (v_owner, 'test-owner@pos.local', '{"full_name":"Test Owner"}'::jsonb),
    (v_sales, 'test-sales@pos.local', '{"full_name":"Test Sales"}'::jsonb),
    (v_admin, 'test-admin@pos.local', '{"full_name":"Test Admin"}'::jsonb)
  on conflict (id) do nothing;

  insert into public.profiles (id, full_name, role, is_active)
  values
    (v_owner, 'Test Owner', 'owner', true),
    (v_sales, 'Test Sales', 'sales', true),
    (v_admin, 'Test Admin', 'admin', true)
  on conflict (id) do update
    set full_name = excluded.full_name,
        role = excluded.role,
        is_active = true;

  insert into public.suppliers (id, name, company, created_by)
  values (v_supplier, 'Test Supplier', 'Test Co', v_owner);

  insert into public.customers (id, name, phone, created_by)
  values (v_customer, 'Test Customer', '01700000000', v_owner);

  insert into public.products (
    id, name, sku, selling_price, purchase_price, min_selling_price,
    stock_quantity, reorder_level, supplier_id, created_by
  )
  values
    (v_product, 'Test Laptop', 'TEST-' || v_product::text, 100, 60, 50, 10, 2, v_supplier, v_owner),
    (v_oos_product, 'Out Of Stock Item', 'TEST-' || v_oos_product::text, 100, 60, 0, 0, 1, v_supplier, v_owner),
    (v_serial_product, 'Serialized Laptop', 'TEST-' || v_serial_product::text, 500, 350, 100, 1, 0, v_supplier, v_owner);

  insert into public.product_serials (
    id, serial_number, product_id, purchase_price, warranty_months,
    status, supplier_id, created_by
  )
  values (
    v_serial, 'TEST-SN-' || v_serial::text, v_serial_product, 350, 12,
    'in_stock', v_supplier, v_owner
  );

  insert into tmp_pos_tests (
    privileged_role, owner_id, sales_id, admin_id, supplier_id, customer_id,
    product_id, oos_product_id, serial_product_id, serial_id, idempotency_key
  )
  values (
    current_user::text, v_owner, v_sales, v_admin, v_supplier, v_customer,
    v_product, v_oos_product, v_serial_product, v_serial,
    'idem-test-' || gen_random_uuid()::text
  );

  v_item := jsonb_build_object(
    'product_id', v_product,
    'quantity', 1,
    'unit_price', 100
  );
  -- v_item is only built here to document the shape used by the checkout tests.
end
$fixture$;

-- ---------------------------------------------------------------------------
-- 1. anon cannot read customers (privilege error OR zero rows both pass)
-- ---------------------------------------------------------------------------
do $test_anon_customers$
declare
  v_priv text;
  v_count integer;
  v_blocked boolean := false;
begin
  select privileged_role into v_priv from tmp_pos_tests limit 1;

  select count(*) into v_count from public.customers;
  if v_count < 1 then
    raise exception 'FAIL: fixture customer is missing';
  end if;

  begin
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{}', true);
    select count(*) into v_count from public.customers;
  exception
    when insufficient_privilege then v_blocked := true;
  end;

  perform set_config('role', v_priv, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);

  if not v_blocked and v_count <> 0 then
    raise exception 'FAIL: anon could read % customers', v_count;
  end if;

  raise notice 'PASS: anon cannot read customers (privilege_blocked=%)', v_blocked;
end
$test_anon_customers$;

-- ---------------------------------------------------------------------------
-- 2. sales cannot adjust stock
-- ---------------------------------------------------------------------------
do $test_sales_adjust$
declare
  v_priv text;
  v_sales uuid;
  v_product uuid;
  v_blocked boolean := false;
begin
  select privileged_role, sales_id, product_id
  into v_priv, v_sales, v_product
  from tmp_pos_tests limit 1;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_sales::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_sales, 'role', 'authenticated')::text, true);

  begin
    perform public.adjust_stock(v_product, 1, 'adjustment', 'should be denied');
  exception
    when others then
      if sqlerrm like 'permission denied%' then
        v_blocked := true;
      else
        raise;
      end if;
  end;

  perform set_config('role', v_priv, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);

  if not v_blocked then
    raise exception 'FAIL: sales role was able to call adjust_stock';
  end if;

  raise notice 'PASS: sales cannot adjust stock';
end
$test_sales_adjust$;

-- ---------------------------------------------------------------------------
-- 3. duplicate serial_number insert fails
-- ---------------------------------------------------------------------------
do $test_duplicate_serial$
declare
  v_priv text;
  v_product uuid;
  v_serial_number text := 'TEST-DUPLICATE-' || gen_random_uuid()::text;
  v_blocked boolean := false;
begin
  select privileged_role, serial_product_id into v_priv, v_product
  from tmp_pos_tests limit 1;

  begin
    insert into public.product_serials (serial_number, product_id, status)
    values (v_serial_number, v_product, 'in_stock');

    insert into public.product_serials (serial_number, product_id, status)
    values (v_serial_number, v_product, 'in_stock');
  exception
    when unique_violation then v_blocked := true;
  end;

  perform set_config('role', v_priv, true);

  if not v_blocked then
    raise exception 'FAIL: duplicate serial_number was accepted';
  end if;

  raise notice 'PASS: duplicate serial insert fails';
end
$test_duplicate_serial$;

-- ---------------------------------------------------------------------------
-- 4. checkout over stock fails
-- ---------------------------------------------------------------------------
do $test_checkout_over_stock$
declare
  v_priv text;
  v_sales uuid;
  v_customer uuid;
  v_product uuid;
  v_blocked boolean := false;
begin
  select privileged_role, sales_id, customer_id, oos_product_id
  into v_priv, v_sales, v_customer, v_product
  from tmp_pos_tests limit 1;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_sales::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_sales, 'role', 'authenticated')::text, true);

  begin
    perform public.checkout(
      jsonb_build_array(jsonb_build_object(
        'product_id', v_product,
        'quantity', 2,
        'unit_price', 100
      )),
      v_customer,
      jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 200))
    );
  exception
    when others then
      if sqlerrm like 'insufficient stock%' then
        v_blocked := true;
      else
        raise;
      end if;
  end;

  perform set_config('role', v_priv, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);

  if not v_blocked then
    raise exception 'FAIL: checkout accepted an over-stock quantity';
  end if;

  raise notice 'PASS: checkout over stock fails';
end
$test_checkout_over_stock$;

-- ---------------------------------------------------------------------------
-- 5. negative stock update fails (CHECK constraint)
-- ---------------------------------------------------------------------------
do $test_negative_stock$
declare
  v_priv text;
  v_product uuid;
  v_blocked boolean := false;
begin
  select privileged_role, product_id into v_priv, v_product
  from tmp_pos_tests limit 1;

  begin
    update public.products
    set stock_quantity = -1
    where id = v_product;
  exception
    when check_violation then v_blocked := true;
  end;

  perform set_config('role', v_priv, true);

  if not v_blocked then
    raise exception 'FAIL: negative stock_quantity was accepted';
  end if;

  raise notice 'PASS: negative stock update fails';
end
$test_negative_stock$;

-- ---------------------------------------------------------------------------
-- 6. non-owner cannot call apply_role (sales and admin both denied)
-- ---------------------------------------------------------------------------
do $test_apply_role$
declare
  v_priv text;
  v_sales uuid;
  v_admin uuid;
  v_sales_blocked boolean := false;
  v_admin_blocked boolean := false;
begin
  select privileged_role, sales_id, admin_id
  into v_priv, v_sales, v_admin
  from tmp_pos_tests limit 1;

  -- sales caller
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_sales::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_sales, 'role', 'authenticated')::text, true);

  begin
    perform public.apply_role(v_sales, 'admin');
  exception
    when others then
      if sqlerrm like 'permission denied%' then
        v_sales_blocked := true;
      else
        raise;
      end if;
  end;

  -- admin caller is still not an owner
  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  begin
    perform public.apply_role(v_sales, 'owner');
  exception
    when others then
      if sqlerrm like 'permission denied%' then
        v_admin_blocked := true;
      else
        raise;
      end if;
  end;

  perform set_config('role', v_priv, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);

  if not v_sales_blocked then
    raise exception 'FAIL: sales role called apply_role successfully';
  end if;
  if not v_admin_blocked then
    raise exception 'FAIL: admin role called apply_role successfully';
  end if;

  raise notice 'PASS: non-owner cannot call apply_role';
end
$test_apply_role$;

-- ---------------------------------------------------------------------------
-- 7. idempotent checkout returns the same invoice and creates one sale
-- ---------------------------------------------------------------------------
do $test_idempotent_checkout$
declare
  v_priv text;
  v_sales uuid;
  v_customer uuid;
  v_product uuid;
  v_key text;
  v_items jsonb;
  v_payments jsonb;
  v_first jsonb;
  v_second jsonb;
  v_row_count integer;
  v_stock_after numeric(12,3);
begin
  select privileged_role, sales_id, customer_id, product_id, idempotency_key
  into v_priv, v_sales, v_customer, v_product, v_key
  from tmp_pos_tests limit 1;

  v_items := jsonb_build_array(jsonb_build_object(
    'product_id', v_product,
    'quantity', 1,
    'unit_price', 100
  ));
  v_payments := jsonb_build_array(jsonb_build_object(
    'method', 'cash',
    'amount', 100
  ));

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', v_sales::text, true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_sales, 'role', 'authenticated')::text, true);

  v_first := public.checkout(v_items, v_customer, v_payments, 0, 0, 0, v_key);
  v_second := public.checkout(v_items, v_customer, v_payments, 0, 0, 0, v_key);

  perform set_config('role', v_priv, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '{}', true);

  if v_first->>'invoice_number' is null then
    raise exception 'FAIL: first checkout returned no invoice_number';
  end if;
  if v_first->>'invoice_number' is distinct from v_second->>'invoice_number' then
    raise exception 'FAIL: idempotent checkout returned a different invoice (%, %)',
      v_first->>'invoice_number', v_second->>'invoice_number';
  end if;
  if coalesce((v_second->>'idempotent')::boolean, false) is not true then
    raise exception 'FAIL: second checkout was not marked idempotent';
  end if;

  select count(*) into v_row_count
  from public.sales
  where idempotency_key = v_key;
  if v_row_count <> 1 then
    raise exception 'FAIL: idempotency key produced % sales', v_row_count;
  end if;

  select stock_quantity into v_stock_after
  from public.products
  where id = v_product;
  if v_stock_after <> 9 then
    raise exception 'FAIL: expected stock 9 after one checkout, got %', v_stock_after;
  end if;

  raise notice 'PASS: idempotent checkout returned % twice', v_first->>'invoice_number';
end
$test_idempotent_checkout$;

-- ---------------------------------------------------------------------------
-- Verification queries (results are still inside the transaction)
-- ---------------------------------------------------------------------------
select 'seeded_roles' as check_name, count(*)::text as result
from public.roles;

select 'store_settings_rows' as check_name, count(*)::text as result
from public.store_settings;

select 'checkout_rows_for_idempotency_key' as check_name, count(*)::text as result
from public.sales s
join tmp_pos_tests t on t.idempotency_key = s.idempotency_key;

select 'audit_rows_from_checkout' as check_name, count(*)::text as result
from public.audit_logs
where action = 'checkout';

-- Discard every fixture and assertion side effect.
rollback;
