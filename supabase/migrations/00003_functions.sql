-- 00003_functions.sql
-- Permission API, transactional RPCs, triggers and read-only reports.
-- Every function is security definer with a pinned search_path.

-- ---------------------------------------------------------------------------
-- Permission API
-- ---------------------------------------------------------------------------
create or replace function public.has_permission(
  p_permission text,
  p_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  with caller as (
    select role, is_active
    from public.profiles
    where id = p_user
  )
  select coalesce((
    select case
      when not exists (select 1 from caller where is_active) then false

      when (select role from caller) = 'owner' then true

      when (select role from caller) = 'admin' then
        case
          -- Explicitly withheld from admins.
          when p_permission = any(array[
            'users.manage', 'settings.edit', 'audit.view', 'reports.profit'
          ]) then false
          when p_permission like 'products.%'
            or p_permission like 'inventory.%'
            or p_permission like 'sales.%'
            or p_permission like 'customers.%'
            or p_permission like 'suppliers.%'
            or p_permission like 'purchases.%'
            or p_permission like 'expenses.%'
            or p_permission like 'reports.%'
            or p_permission = any(array[
              'pos.access', 'invoices.view', 'invoices.print',
              'held_carts.manage', 'serials.view', 'serials.manage',
              'returns.view', 'returns.create', 'returns.approve', 'returns.request',
              'warranty.view', 'warranty.manage', 'cash.view', 'cash.manage',
              'users.view', 'settings.view', 'dashboard.view', 'broadcast.manage'
            ])
          then true
          else false
        end

      when (select role from caller) = 'sales' then
        p_permission = any(array[
          'pos.access', 'products.view', 'customers.view',
          'customers.create', 'customers.edit', 'sales.view',
          'invoices.view', 'invoices.print', 'held_carts.manage',
          'returns.view', 'returns.request', 'warranty.view', 'warranty.manage',
          'cash.view', 'cash.manage', 'dashboard.view'
        ])

      when (select role from caller) = 'inventory' then
        p_permission = any(array[
          'dashboard.view', 'products.view', 'products.create', 'products.edit',
          'inventory.view', 'inventory.receive', 'inventory.adjust', 'inventory.audit',
          'serials.view', 'serials.manage', 'warranty.view',
          'suppliers.view', 'suppliers.create', 'suppliers.edit',
          'purchases.view', 'purchases.create',
          'reports.view', 'reports.inventory'
        ])

      else false
    end
  ), false);
$fn$;

create or replace function public.current_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active
$fn$;

-- ---------------------------------------------------------------------------
-- checkout: the only supported way to create a sale.
-- ---------------------------------------------------------------------------
create or replace function public.checkout(
  p_items jsonb,
  p_customer_id uuid,
  p_payments jsonb,
  p_discount numeric default 0,
  p_tax numeric default 0,
  p_delivery numeric default 0,
  p_idempotency_key text default null,
  p_warranty_months integer default 0,
  p_held_cart_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_sale_id uuid := gen_random_uuid();
  v_invoice_number text;
  v_prefix text;
  v_year text;
  v_seq integer;
  v_existing jsonb;

  v_item jsonb;
  v_payment jsonb;
  v_product_id uuid;
  v_serial_id uuid;
  v_qty numeric(12,3);
  v_unit_price numeric(14,2);
  v_item_discount numeric(14,2);
  v_line_total numeric(14,2);

  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := coalesce(p_discount, 0);
  v_tax numeric(14,2) := coalesce(p_tax, 0);
  v_delivery numeric(14,2) := coalesce(p_delivery, 0);
  v_total numeric(14,2);
  v_paid numeric(14,2) := 0;
  v_due numeric(14,2);
  v_payment_amount numeric(14,2);
  v_payment_method text;

  v_payments jsonb := coalesce(p_payments, '[]'::jsonb);
  v_product_ids uuid[] := array[]::uuid[];
  v_serial_ids uuid[] := array[]::uuid[];
  v_requested_count integer;
  v_found_count integer;

  v_stock numeric(12,3);
  v_min_price numeric(14,2);
  v_product_active boolean;
  v_product_archived boolean;
  v_product_serialized boolean;
  v_product_name text;
  v_product_warranty integer;
  v_serial_product_id uuid;
  v_serial_status text;
  v_serial_number text;
  v_warranty_months integer;

  v_previous numeric(12,3);
  v_new numeric(12,3);
  v_updated integer;
begin
  if not public.has_permission('pos.access') then
    raise exception 'permission denied: pos.access required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items must be a non-empty jsonb array';
  end if;
  if jsonb_typeof(v_payments) is distinct from 'array' then
    raise exception 'p_payments must be a jsonb array';
  end if;
  if v_discount < 0 or v_tax < 0 or v_delivery < 0 then
    raise exception 'discount, tax and delivery must be non-negative';
  end if;

  -- Replays with the same key block until the first call commits, then return
  -- the already-created invoice instead of creating a second sale.
  if p_idempotency_key is not null and btrim(p_idempotency_key) <> '' then
    perform pg_advisory_xact_lock(hashtext('checkout-idem:' || p_idempotency_key));

    select jsonb_build_object(
      'sale_id', s.id,
      'invoice_number', s.invoice_number,
      'total', s.total,
      'paid', s.paid,
      'due', s.due,
      'idempotent', true
    )
    into v_existing
    from public.sales s
    where s.idempotency_key = p_idempotency_key;

    if found then
      return v_existing;
    end if;
  end if;

  -- Pass 1: validate shapes and gather ids. Any client-supplied totals in the
  -- JSON are deliberately ignored; everything below is recomputed here.
  for v_item in select value from jsonb_array_elements(p_items) as t(value) loop
    if v_item->>'product_id' is null
       or v_item->>'quantity' is null
       or v_item->>'unit_price' is null then
      raise exception 'each item needs product_id, quantity and unit_price';
    end if;

    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric(12,3);
    v_unit_price := (v_item->>'unit_price')::numeric(14,2);
    v_item_discount := coalesce((v_item->>'discount')::numeric, 0);
    v_serial_id := nullif(v_item->>'serial_id', '')::uuid;

    if v_qty <= 0 then
      raise exception 'quantity must be greater than zero for product %', v_product_id;
    end if;
    if v_unit_price < 0 then
      raise exception 'unit_price cannot be negative for product %', v_product_id;
    end if;
    if v_item_discount < 0 or v_item_discount > v_qty * v_unit_price then
      raise exception 'invalid item discount for product %', v_product_id;
    end if;

    v_line_total := round(v_qty * v_unit_price - v_item_discount, 2);
    v_subtotal := round(v_subtotal + v_line_total, 2);

    if not (v_product_id = any(v_product_ids)) then
      v_product_ids := array_append(v_product_ids, v_product_id);
    end if;
    if v_serial_id is not null and not (v_serial_id = any(v_serial_ids)) then
      v_serial_ids := array_append(v_serial_ids, v_serial_id);
    end if;
  end loop;

  if v_discount > v_subtotal then
    raise exception 'sale discount cannot exceed subtotal';
  end if;

  for v_payment in select value from jsonb_array_elements(v_payments) as t(value) loop
    v_payment_method := nullif(btrim(coalesce(v_payment->>'method', '')), '');
    v_payment_amount := (v_payment->>'amount')::numeric(14,2);

    if v_payment_method is null then
      raise exception 'every payment needs a method';
    end if;
    if v_payment_amount is null or v_payment_amount <= 0 then
      raise exception 'payment amount must be greater than zero';
    end if;

    v_paid := round(v_paid + v_payment_amount, 2);
  end loop;

  v_total := round(v_subtotal - v_discount + v_tax + v_delivery, 2);
  v_due := round(greatest(v_total - v_paid, 0), 2);

  -- Deterministic lock order prevents deadlocks between concurrent checkouts.
  if array_length(v_product_ids, 1) is not null then
    perform 1
    from public.products p
    where p.id = any(v_product_ids)
    order by p.id
    for update;

    select count(*) into v_requested_count
    from (select distinct unnest(v_product_ids) as id) d;

    select count(*) into v_found_count
    from public.products p
    where p.id = any(v_product_ids);

    if v_found_count <> v_requested_count then
      raise exception 'one or more products do not exist';
    end if;
  end if;

  if array_length(v_serial_ids, 1) is not null then
    perform 1
    from public.product_serials ps
    where ps.id = any(v_serial_ids)
    order by ps.id
    for update;
  end if;

  -- Pass 2: validate against locked rows before writing anything.
  for v_item in select value from jsonb_array_elements(p_items) as t(value) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric(12,3);
    v_unit_price := (v_item->>'unit_price')::numeric(14,2);
    v_serial_id := nullif(v_item->>'serial_id', '')::uuid;

    select stock_quantity, min_selling_price, is_active, is_archived,
           is_serialized, name, warranty_months
    into v_stock, v_min_price, v_product_active, v_product_archived,
         v_product_serialized, v_product_name, v_product_warranty
    from public.products
    where id = v_product_id;

    if not v_product_active or v_product_archived then
      raise exception 'product % is not available for sale', v_product_id;
    end if;
    if v_stock < v_qty then
      raise exception 'insufficient stock for product % (available %, requested %)',
        v_product_id, v_stock, v_qty;
    end if;

    -- The floor applies to everyone. Owner/admin may override the normal price
    -- only when the chosen price is still >= min_selling_price.
    if v_unit_price < v_min_price then
      raise exception 'unit price % is below minimum % for product %',
        v_unit_price, v_min_price, v_product_id;
    end if;

    if v_product_serialized and v_serial_id is null then
      raise exception 'serial_id is required for serialized product %', v_product_id;
    end if;

    if v_serial_id is not null then
      select product_id, status, serial_number
      into v_serial_product_id, v_serial_status, v_serial_number
      from public.product_serials
      where id = v_serial_id;

      if not found then
        raise exception 'serial % does not exist', v_serial_id;
      end if;
      if v_serial_product_id <> v_product_id then
        raise exception 'serial % belongs to a different product', v_serial_id;
      end if;
      if v_serial_status not in ('in_stock', 'reserved') then
        raise exception 'serial % is % and cannot be sold', v_serial_id, v_serial_status;
      end if;
    end if;
  end loop;

  -- Prefix-YYYY-000001, serialized per prefix/year with an advisory lock.
  select coalesce(nullif(invoice_prefix, ''), 'MB')
  into v_prefix
  from public.store_settings
  order by is_default desc
  limit 1;
  v_prefix := coalesce(v_prefix, 'MB');
  v_year := to_char(now(), 'YYYY');

  perform pg_advisory_xact_lock(hashtext('checkout-invoice:' || v_prefix || ':' || v_year));

  select coalesce(max(substring(invoice_number from '([0-9]{6})$')::integer), 0) + 1
  into v_seq
  from public.sales
  where invoice_number like v_prefix || '-' || v_year || '-%';

  if v_seq > 999999 then
    raise exception 'invoice sequence exhausted for %', v_year;
  end if;

  v_invoice_number := v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 6, '0');

  insert into public.sales (
    id, invoice_number, customer_id, employee_id,
    subtotal, discount, tax, delivery, total, paid, due,
    status, sale_date, idempotency_key
  )
  values (
    v_sale_id, v_invoice_number, p_customer_id, auth.uid(),
    v_subtotal, v_discount, v_tax, v_delivery, v_total, v_paid, v_due,
    'completed', now(),
    case
      when p_idempotency_key is null or btrim(p_idempotency_key) = '' then null
      else p_idempotency_key
    end
  );

  -- Pass 3: write items and perform guarded atomic stock decrements.
  for v_item in select value from jsonb_array_elements(p_items) as t(value) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric(12,3);
    v_unit_price := (v_item->>'unit_price')::numeric(14,2);
    v_item_discount := coalesce((v_item->>'discount')::numeric, 0);
    v_serial_id := nullif(v_item->>'serial_id', '')::uuid;
    v_line_total := round(v_qty * v_unit_price - v_item_discount, 2);

    select stock_quantity, name
    into v_previous, v_product_name
    from public.products
    where id = v_product_id;

    update public.products
    set stock_quantity = stock_quantity - v_qty,
        updated_at = now(),
        updated_by = auth.uid()
    where id = v_product_id
      and stock_quantity >= v_qty;
    get diagnostics v_updated = row_count;

    if v_updated <> 1 then
      raise exception 'stock update failed for product % (concurrent sale?)', v_product_id;
    end if;

    v_new := round(v_previous - v_qty, 3);

    insert into public.stock_movements (
      product_id, movement_type, quantity, previous_quantity, new_quantity,
      reference, reason, employee_id
    )
    values (
      v_product_id, 'sale', -v_qty, v_previous, v_new,
      v_invoice_number, 'POS checkout ' || v_invoice_number, auth.uid()
    );

    if v_serial_id is not null then
      update public.product_serials
      set status = 'sold',
          sale_id = v_sale_id,
          customer_id = p_customer_id,
          sold_at = now(),
          updated_at = now()
      where id = v_serial_id
        and product_id = v_product_id
        and status in ('in_stock', 'reserved');

      if not found then
        raise exception 'serial % could not be reserved for sale', v_serial_id;
      end if;

      select serial_number into v_serial_number
      from public.product_serials
      where id = v_serial_id;
    else
      v_serial_number := null;
    end if;

    v_warranty_months := coalesce((v_item->>'warranty_months')::integer, p_warranty_months, 0);

    insert into public.sale_items (
      sale_id, product_id, serial_id, quantity, unit_price, discount,
      subtotal, warranty_months, product_name, serial_number
    )
    values (
      v_sale_id, v_product_id, v_serial_id, v_qty, v_unit_price, v_item_discount,
      v_line_total, v_warranty_months, v_product_name, v_serial_number
    );
  end loop;

  for v_payment in select value from jsonb_array_elements(v_payments) as t(value) loop
    insert into public.sale_payments (sale_id, method, amount, reference, paid_at, created_by)
    values (
      v_sale_id,
      nullif(btrim(v_payment->>'method'), ''),
      (v_payment->>'amount')::numeric(14,2),
      nullif(v_payment->>'reference', ''),
      now(),
      auth.uid()
    );
  end loop;

  if p_held_cart_id is not null then
    delete from public.held_carts
    where id = p_held_cart_id
      and (created_by = auth.uid() or public.has_permission('held_carts.manage'));

    if not found then
      raise exception 'held cart % not found or not owned by caller', p_held_cart_id;
    end if;
  end if;

  insert into public.audit_logs (user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(), 'checkout', 'sales', v_sale_id,
    jsonb_build_object(
      'invoice_number', v_invoice_number,
      'total', v_total,
      'paid', v_paid,
      'due', v_due,
      'item_count', jsonb_array_length(p_items)
    )
  );

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'invoice_number', v_invoice_number,
    'total', v_total,
    'paid', v_paid,
    'due', v_due,
    'idempotent', false
  );
end
$fn$;

-- ---------------------------------------------------------------------------
-- receive_purchase
-- ---------------------------------------------------------------------------
create or replace function public.receive_purchase(
  p_supplier_id uuid,
  p_reference text,
  p_purchase_date date,
  p_paid numeric,
  p_items jsonb,
  p_serials jsonb default '[]'::jsonb,
  p_discount numeric default 0,
  p_tax numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_purchase_id uuid := gen_random_uuid();
  v_date date := coalesce(p_purchase_date, current_date);
  v_item jsonb;
  v_serial_item jsonb;
  v_product_id uuid;
  v_qty numeric(12,3);
  v_unit_cost numeric(14,2);
  v_line_total numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := coalesce(p_discount, 0);
  v_tax numeric(14,2) := coalesce(p_tax, 0);
  v_total numeric(14,2);
  v_paid numeric(14,2) := coalesce(p_paid, 0);
  v_due numeric(14,2);
  v_product_ids uuid[] := array[]::uuid[];
  v_requested_count integer;
  v_found_count integer;
  v_previous numeric(12,3);
  v_new numeric(12,3);
  v_updated integer;
  v_serial_numbers text[];
  v_serial_product_id uuid;
  v_serial_number text;
  v_serial_cost numeric(14,2);
  v_warranty integer;
  v_product_warranty integer;
  v_expiry date;
  v_location text;
  v_condition text;
  v_serials jsonb := coalesce(p_serials, '[]'::jsonb);
begin
  if not (public.has_permission('inventory.receive')
          or public.has_permission('purchases.create')) then
    raise exception 'permission denied: inventory.receive required' using errcode = '42501';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items must be a non-empty jsonb array';
  end if;
  if jsonb_typeof(v_serials) is distinct from 'array' then
    raise exception 'p_serials must be a jsonb array';
  end if;
  if v_discount < 0 or v_tax < 0 or v_paid < 0 then
    raise exception 'discount, tax and paid must be non-negative';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as t(value) loop
    if v_item->>'product_id' is null
       or v_item->>'quantity' is null
       or v_item->>'unit_cost' is null then
      raise exception 'each item needs product_id, quantity and unit_cost';
    end if;

    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric(12,3);
    v_unit_cost := (v_item->>'unit_cost')::numeric(14,2);

    if v_qty <= 0 then
      raise exception 'purchase quantity must be greater than zero';
    end if;
    if v_unit_cost < 0 then
      raise exception 'unit_cost cannot be negative';
    end if;

    v_line_total := round(v_qty * v_unit_cost, 2);
    v_subtotal := round(v_subtotal + v_line_total, 2);

    if not (v_product_id = any(v_product_ids)) then
      v_product_ids := array_append(v_product_ids, v_product_id);
    end if;
  end loop;

  if v_discount > v_subtotal then
    raise exception 'purchase discount cannot exceed subtotal';
  end if;
  v_total := round(v_subtotal - v_discount + v_tax, 2);
  v_due := round(greatest(v_total - v_paid, 0), 2);

  if array_length(v_product_ids, 1) is not null then
    perform 1
    from public.products p
    where p.id = any(v_product_ids)
    order by p.id
    for update;

    select count(*) into v_requested_count
    from (select distinct unnest(v_product_ids) as id) d;
    select count(*) into v_found_count
    from public.products p
    where p.id = any(v_product_ids);

    if v_found_count <> v_requested_count then
      raise exception 'one or more products do not exist';
    end if;
  end if;

  insert into public.purchases (
    id, supplier_id, reference, purchase_date,
    subtotal, discount, tax, total, paid, due, status, notes, created_by
  )
  values (
    v_purchase_id, p_supplier_id, p_reference, v_date,
    v_subtotal, v_discount, v_tax, v_total, v_paid, v_due, 'received',
    p_reference, auth.uid()
  );

  for v_item in select value from jsonb_array_elements(p_items) as t(value) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric(12,3);
    v_unit_cost := (v_item->>'unit_cost')::numeric(14,2);
    v_line_total := round(v_qty * v_unit_cost, 2);

    select coalesce(array_agg(s.value #>> '{}'), array[]::text[])
    into v_serial_numbers
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_item->'serial_numbers') = 'array'
          then v_item->'serial_numbers'
        else '[]'::jsonb
      end
    ) as s(value);

    insert into public.purchase_items (
      purchase_id, product_id, quantity, unit_cost, subtotal, serial_numbers
    )
    values (v_purchase_id, v_product_id, v_qty, v_unit_cost, v_line_total, v_serial_numbers);

    select stock_quantity into v_previous
    from public.products
    where id = v_product_id;

    update public.products
    set stock_quantity = stock_quantity + v_qty,
        purchase_price = v_unit_cost,
        updated_at = now(),
        updated_by = auth.uid()
    where id = v_product_id;
    get diagnostics v_updated = row_count;

    if v_updated <> 1 then
      raise exception 'stock increase failed for product %', v_product_id;
    end if;

    v_new := round(v_previous + v_qty, 3);

    insert into public.stock_movements (
      product_id, movement_type, quantity, previous_quantity, new_quantity,
      reference, reason, employee_id
    )
    values (
      v_product_id, 'purchase', v_qty, v_previous, v_new,
      coalesce(p_reference, v_purchase_id::text),
      'Purchase receipt ' || coalesce(p_reference, v_purchase_id::text),
      auth.uid()
    );
  end loop;

  -- Serial rows are inserted explicitly; duplicate serial numbers raise a
  -- unique violation and roll back the whole purchase.
  for v_serial_item in select value from jsonb_array_elements(v_serials) as t(value) loop
    if v_serial_item->>'product_id' is null
       or nullif(btrim(coalesce(v_serial_item->>'serial_number', '')), '') is null then
      raise exception 'each serial needs product_id and serial_number';
    end if;

    v_serial_product_id := (v_serial_item->>'product_id')::uuid;
    v_serial_number := btrim(v_serial_item->>'serial_number');

    select warranty_months into v_product_warranty
    from public.products
    where id = v_serial_product_id;

    if not found then
      raise exception 'serial product % does not exist', v_serial_product_id;
    end if;

    v_serial_cost := coalesce((v_serial_item->>'purchase_price')::numeric(14,2), 0);
    v_warranty := coalesce((v_serial_item->>'warranty_months')::integer, v_product_warranty, 12);
    v_expiry := (v_date + make_interval(months => v_warranty))::date;
    v_location := nullif(v_serial_item->>'location', '');
    v_condition := nullif(v_serial_item->>'condition', '');

    insert into public.product_serials (
      serial_number, product_id, purchase_price, purchase_date, supplier_id,
      warranty_months, warranty_expiry, condition, location, status, notes, created_by
    )
    values (
      v_serial_number, v_serial_product_id, v_serial_cost, v_date, p_supplier_id,
      v_warranty, v_expiry, coalesce(v_condition, 'new'), v_location,
      'in_stock', nullif(v_serial_item->>'notes', ''), auth.uid()
    );
  end loop;

  if v_paid > 0 and p_supplier_id is not null then
    insert into public.supplier_payments (
      supplier_id, purchase_id, amount, method, reference, paid_at, created_by
    )
    values (
      p_supplier_id, v_purchase_id, v_paid, 'cash',
      p_reference, now(), auth.uid()
    );
  end if;

  insert into public.audit_logs (user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(), 'receive_purchase', 'purchases', v_purchase_id,
    jsonb_build_object(
      'reference', p_reference,
      'supplier_id', p_supplier_id,
      'total', v_total,
      'paid', v_paid,
      'due', v_due
    )
  );

  return jsonb_build_object(
    'purchase_id', v_purchase_id,
    'reference', p_reference,
    'total', v_total,
    'paid', v_paid,
    'due', v_due
  );
end
$fn$;

-- ---------------------------------------------------------------------------
-- adjust_stock
-- ---------------------------------------------------------------------------
create or replace function public.adjust_stock(
  p_product_id uuid,
  p_quantity numeric,
  p_movement_type text,
  p_reason text,
  p_location text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_previous numeric(12,3);
  v_new numeric(12,3);
  v_updated integer;
  v_reason text := coalesce(p_reason, 'Manual stock adjustment');
begin
  if not public.has_permission('inventory.adjust') then
    raise exception 'permission denied: inventory.adjust required' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity = 0 then
    raise exception 'quantity must be a non-zero delta';
  end if;
  if p_movement_type not in ('adjustment', 'damage', 'audit', 'return') then
    raise exception 'invalid adjustment movement_type: %', p_movement_type;
  end if;
  if p_location is not null and btrim(p_location) <> '' then
    v_reason := v_reason || ' @ ' || btrim(p_location);
  end if;

  select stock_quantity into v_previous
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'product % does not exist', p_product_id;
  end if;

  v_new := round(v_previous + p_quantity, 3);
  if v_new < 0 then
    raise exception 'adjustment would make stock negative for product %', p_product_id;
  end if;

  update public.products
  set stock_quantity = v_new,
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_product_id
    and stock_quantity + p_quantity >= 0;
  get diagnostics v_updated = row_count;

  if v_updated <> 1 then
    raise exception 'stock adjustment failed for product %', p_product_id;
  end if;

  insert into public.stock_movements (
    product_id, movement_type, quantity, previous_quantity, new_quantity,
    reference, reason, employee_id
  )
  values (
    p_product_id, p_movement_type, p_quantity, v_previous, v_new,
    null, v_reason, auth.uid()
  );

  insert into public.audit_logs (user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(), 'adjust_stock', 'products', p_product_id,
    jsonb_build_object(
      'delta', p_quantity,
      'previous_quantity', v_previous,
      'new_quantity', v_new,
      'movement_type', p_movement_type,
      'reason', v_reason
    )
  );

  return jsonb_build_object(
    'product_id', p_product_id,
    'previous_quantity', v_previous,
    'new_quantity', v_new,
    'movement_type', p_movement_type
  );
end
$fn$;

-- ---------------------------------------------------------------------------
-- process_return
-- ---------------------------------------------------------------------------
create or replace function public.process_return(
  p_sale_id uuid,
  p_items jsonb,
  p_refund_amount numeric default 0,
  p_reason text default null,
  p_restock boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_return_id uuid := gen_random_uuid();
  v_customer_id uuid;
  v_sale_status text;
  v_final_status text;
  v_item jsonb;
  v_sale_item_id uuid;
  v_product_id uuid;
  v_serial_id uuid;
  v_qty numeric(12,3);
  v_refund numeric(14,2) := coalesce(p_refund_amount, 0);
  v_status text;
  v_product_ids uuid[] := array[]::uuid[];
  v_match_count integer;
  v_previous numeric(12,3);
  v_new numeric(12,3);
  v_updated integer;
  v_shift_id uuid;
  v_unreturned integer;
begin
  if not (public.has_permission('returns.approve')
          or public.has_permission('returns.request')) then
    raise exception 'permission denied: returns.request required' using errcode = '42501';
  end if;
  if coalesce(p_restock, false) and not public.has_permission('returns.approve') then
    raise exception 'permission denied: returns.approve required to restock' using errcode = '42501';
  end if;
  if v_refund < 0 then
    raise exception 'refund_amount cannot be negative';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'p_items must be a non-empty jsonb array';
  end if;

  select customer_id, status into v_customer_id, v_sale_status
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'sale % does not exist', p_sale_id;
  end if;
  if v_sale_status = 'cancelled' then
    raise exception 'cannot return a cancelled sale';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as t(value) loop
    if v_item->>'product_id' is null or v_item->>'quantity' is null then
      raise exception 'each return item needs product_id and quantity';
    end if;

    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric(12,3);
    v_sale_item_id := nullif(v_item->>'sale_item_id', '')::uuid;
    v_serial_id := nullif(v_item->>'serial_id', '')::uuid;

    if v_qty <= 0 then
      raise exception 'return quantity must be greater than zero';
    end if;

    if v_sale_item_id is not null then
      select count(*) into v_match_count
      from public.sale_items si
      where si.id = v_sale_item_id
        and si.sale_id = p_sale_id
        and si.product_id = v_product_id;

      if v_match_count <> 1 then
        raise exception 'sale_item % does not belong to sale % / product %',
          v_sale_item_id, p_sale_id, v_product_id;
      end if;
    end if;

    if not (v_product_id = any(v_product_ids)) then
      v_product_ids := array_append(v_product_ids, v_product_id);
    end if;
  end loop;

  perform 1
  from public.products p
  where p.id = any(v_product_ids)
  order by p.id
  for update;

  v_status := case when coalesce(p_restock, false) then 'approved' else 'pending' end;

  insert into public.returns (
    id, sale_id, customer_id, reason, refund_amount, exchange_amount,
    status, approved_by, notes, created_by
  )
  values (
    v_return_id, p_sale_id, v_customer_id,
    coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'Item return'),
    v_refund, 0, v_status,
    case when coalesce(p_restock, false) then auth.uid() else null end,
    p_reason, auth.uid()
  );

  for v_item in select value from jsonb_array_elements(p_items) as t(value) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric(12,3);
    v_sale_item_id := nullif(v_item->>'sale_item_id', '')::uuid;
    v_serial_id := nullif(v_item->>'serial_id', '')::uuid;

    if coalesce(p_restock, false) then
      select stock_quantity into v_previous
      from public.products
      where id = v_product_id;

      update public.products
      set stock_quantity = stock_quantity + v_qty,
          updated_at = now(),
          updated_by = auth.uid()
      where id = v_product_id;
      get diagnostics v_updated = row_count;

      if v_updated <> 1 then
        raise exception 'restock failed for product %', v_product_id;
      end if;

      v_new := round(v_previous + v_qty, 3);

      insert into public.stock_movements (
        product_id, movement_type, quantity, previous_quantity, new_quantity,
        reference, reason, employee_id
      )
      values (
        v_product_id, 'return', v_qty, v_previous, v_new,
        v_return_id::text, 'Approved return restock', auth.uid()
      );

      if v_serial_id is not null then
        update public.product_serials
        set status = 'returned', updated_at = now()
        where id = v_serial_id
          and product_id = v_product_id;
      end if;
    end if;

    insert into public.return_items (
      return_id, sale_item_id, product_id, serial_id, quantity, condition,
      restocked, restock_approved_by
    )
    values (
      v_return_id, v_sale_item_id, v_product_id, v_serial_id, v_qty,
      nullif(v_item->>'condition', ''),
      coalesce(p_restock, false),
      case when coalesce(p_restock, false) then auth.uid() else null end
    );
  end loop;

  if v_refund > 0 then
    select id into v_shift_id
    from public.cash_shifts
    where employee_id = auth.uid()
      and status = 'open'
    order by opened_at desc
    limit 1;

    if v_shift_id is not null then
      insert into public.cash_movements (
        shift_id, movement_type, amount, description, created_by
      )
      values (
        v_shift_id, 'refund', v_refund,
        'Refund for return ' || v_return_id::text, auth.uid()
      );
    end if;
  end if;

  select count(*) into v_unreturned
  from public.sale_items si
  where si.sale_id = p_sale_id
    and si.quantity > coalesce((
      select sum(ri.quantity)
      from public.return_items ri
      join public.returns r on r.id = ri.return_id
      where ri.sale_item_id = si.id
        and r.status <> 'rejected'
    ), 0);

  v_final_status := v_sale_status;
  if v_unreturned = 0 then
    update public.sales
    set status = 'returned', updated_at = now()
    where id = p_sale_id;
    v_final_status := 'returned';
  end if;

  insert into public.audit_logs (user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(), 'process_return', 'returns', v_return_id,
    jsonb_build_object(
      'sale_id', p_sale_id,
      'refund_amount', v_refund,
      'restocked', coalesce(p_restock, false),
      'status', v_status
    )
  );

  return jsonb_build_object(
    'return_id', v_return_id,
    'sale_id', p_sale_id,
    'status', v_status,
    'refund_amount', v_refund,
    'restocked', coalesce(p_restock, false),
    'sale_status', v_final_status
  );
end
$fn$;

-- ---------------------------------------------------------------------------
-- Cash drawer
-- ---------------------------------------------------------------------------
create or replace function public.create_cash_shift(
  p_opening_balance numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_shift_id uuid := gen_random_uuid();
  v_opening numeric(14,2) := coalesce(p_opening_balance, 0);
begin
  if not public.has_permission('cash.manage') then
    raise exception 'permission denied: cash.manage required' using errcode = '42501';
  end if;
  if v_opening < 0 then
    raise exception 'opening_balance cannot be negative';
  end if;

  perform pg_advisory_xact_lock(hashtext('cash-shift:' || auth.uid()::text));

  if exists (
    select 1 from public.cash_shifts
    where employee_id = auth.uid() and status = 'open'
  ) then
    raise exception 'employee already has an open cash shift';
  end if;

  insert into public.cash_shifts (
    id, employee_id, opened_at, opening_balance, status, notes
  )
  values (
    v_shift_id, auth.uid(), now(), v_opening, 'open', p_notes
  );

  insert into public.audit_logs (user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(), 'create_cash_shift', 'cash_shifts', v_shift_id,
    jsonb_build_object('opening_balance', v_opening)
  );

  return jsonb_build_object(
    'shift_id', v_shift_id,
    'opening_balance', v_opening,
    'opened_at', now()
  );
end
$fn$;

create or replace function public.close_cash_shift(
  p_shift_id uuid,
  p_actual_closing numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_opened_at timestamptz;
  v_closed_at timestamptz;
  v_employee_id uuid;
  v_opening numeric(14,2);
  v_notes text;
  v_expected numeric(14,2);
  v_difference numeric(14,2);
  v_actual numeric(14,2) := coalesce(p_actual_closing, 0);
begin
  if not public.has_permission('cash.manage') then
    raise exception 'permission denied: cash.manage required' using errcode = '42501';
  end if;
  if v_actual < 0 then
    raise exception 'actual_closing cannot be negative';
  end if;

  select opened_at, closed_at, employee_id, opening_balance, notes
  into v_opened_at, v_closed_at, v_employee_id, v_opening, v_notes
  from public.cash_shifts
  where id = p_shift_id
  for update;

  if not found then
    raise exception 'cash shift % does not exist', p_shift_id;
  end if;
  if v_closed_at is not null then
    raise exception 'cash shift % is already closed', p_shift_id;
  end if;
  if v_employee_id <> auth.uid()
     and public.current_role() not in ('owner', 'admin') then
    raise exception 'permission denied: not your cash shift' using errcode = '42501';
  end if;

  select round(
      v_opening
      + coalesce((
          select sum(sp.amount)
          from public.sale_payments sp
          join public.sales sa on sa.id = sp.sale_id
          where sp.sale_id is not null
            and sp.paid_at between v_opened_at and now()
            and sp.method ilike '%cash%'
            and sa.status = 'completed'
        ), 0)
      + coalesce((
          select sum(cm.amount)
          from public.cash_movements cm
          where cm.shift_id = p_shift_id and cm.movement_type = 'cash_in'
        ), 0)
      - coalesce((
          select sum(cm.amount)
          from public.cash_movements cm
          where cm.shift_id = p_shift_id and cm.movement_type = 'cash_out'
        ), 0)
      - coalesce((
          select sum(cm.amount)
          from public.cash_movements cm
          where cm.shift_id = p_shift_id and cm.movement_type = 'refund'
        ), 0)
      - coalesce((
          select sum(e.amount)
          from public.expenses e
          where coalesce(e.payment_method, '') ilike '%cash%'
            and e.created_at between v_opened_at and now()
        ), 0)
    , 2)
  into v_expected;

  v_difference := round(v_actual - v_expected, 2);

  update public.cash_shifts
  set expected_closing = v_expected,
      actual_closing = v_actual,
      difference = v_difference,
      closed_at = now(),
      status = 'closed',
      notes = coalesce(p_notes, v_notes),
      updated_at = now()
  where id = p_shift_id;

  insert into public.audit_logs (user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(), 'close_cash_shift', 'cash_shifts', p_shift_id,
    jsonb_build_object(
      'opening_balance', v_opening,
      'expected_closing', v_expected,
      'actual_closing', v_actual,
      'difference', v_difference
    )
  );

  return jsonb_build_object(
    'shift_id', p_shift_id,
    'opening_balance', v_opening,
    'expected_closing', v_expected,
    'actual_closing', v_actual,
    'difference', v_difference
  );
end
$fn$;

create or replace function public.cash_movement(
  p_shift_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_movement_id uuid := gen_random_uuid();
  v_employee_id uuid;
  v_status text;
  v_amount numeric(14,2) := coalesce(p_amount, 0);
begin
  if not public.has_permission('cash.manage') then
    raise exception 'permission denied: cash.manage required' using errcode = '42501';
  end if;
  if p_movement_type not in ('cash_in', 'cash_out') then
    raise exception 'cash_movement only accepts cash_in or cash_out';
  end if;
  if v_amount <= 0 then
    raise exception 'amount must be greater than zero';
  end if;

  select employee_id, status into v_employee_id, v_status
  from public.cash_shifts
  where id = p_shift_id
  for update;

  if not found then
    raise exception 'cash shift % does not exist', p_shift_id;
  end if;
  if v_status <> 'open' then
    raise exception 'cash shift % is closed', p_shift_id;
  end if;
  if v_employee_id <> auth.uid()
     and public.current_role() not in ('owner', 'admin') then
    raise exception 'permission denied: not your cash shift' using errcode = '42501';
  end if;

  insert into public.cash_movements (
    id, shift_id, movement_type, amount, description, created_by
  )
  values (
    v_movement_id, p_shift_id, p_movement_type, v_amount, p_description, auth.uid()
  );

  insert into public.audit_logs (user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(), 'cash_movement', 'cash_movements', v_movement_id,
    jsonb_build_object(
      'shift_id', p_shift_id,
      'movement_type', p_movement_type,
      'amount', v_amount
    )
  );

  return jsonb_build_object(
    'movement_id', v_movement_id,
    'shift_id', p_shift_id,
    'movement_type', p_movement_type,
    'amount', v_amount
  );
end
$fn$;

-- ---------------------------------------------------------------------------
-- User administration
-- ---------------------------------------------------------------------------
create or replace function public.apply_role(
  p_user uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller_role text := public.current_role();
  v_target_role text;
begin
  if v_caller_role is distinct from 'owner' then
    raise exception 'permission denied: only owner can apply roles' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'admin', 'sales', 'inventory') then
    raise exception 'invalid role: %', p_role;
  end if;

  select role into v_target_role
  from public.profiles
  where id = p_user;

  if not found then
    raise exception 'profile % does not exist', p_user;
  end if;

  -- Demoting an owner (including yourself) would allow the last owner to be
  -- removed, so it is blocked outright. Promotion to owner remains possible.
  if v_target_role = 'owner' and p_role <> 'owner' then
    raise exception 'cannot demote an owner';
  end if;

  update public.profiles
  set role = p_role, updated_at = now()
  where id = p_user;

  insert into public.audit_logs (user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(), 'apply_role', 'profiles', p_user,
    jsonb_build_object('from_role', v_target_role, 'to_role', p_role)
  );

  return jsonb_build_object(
    'user_id', p_user,
    'previous_role', v_target_role,
    'role', p_role
  );
end
$fn$;

create or replace function public.set_profile_active(
  p_user uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_caller_role text := public.current_role();
  v_target_role text;
begin
  if v_caller_role is distinct from 'owner' then
    raise exception 'permission denied: only owner can change profile status' using errcode = '42501';
  end if;

  select role into v_target_role
  from public.profiles
  where id = p_user;

  if not found then
    raise exception 'profile % does not exist', p_user;
  end if;

  if not coalesce(p_active, false)
     and (p_user = auth.uid() or v_target_role = 'owner') then
    raise exception 'cannot deactivate yourself or an owner';
  end if;

  update public.profiles
  set is_active = coalesce(p_active, false), updated_at = now()
  where id = p_user;

  insert into public.audit_logs (user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(), 'set_profile_active', 'profiles', p_user,
    jsonb_build_object('is_active', coalesce(p_active, false))
  );

  return jsonb_build_object('user_id', p_user, 'is_active', coalesce(p_active, false));
end
$fn$;

create or replace function public.bootstrap_owner()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_owner_count integer;
begin
  -- Serialize first-time setup so two simultaneous callers cannot both win.
  perform pg_advisory_xact_lock(hashtext('bootstrap_owner'));

  select count(*) into v_owner_count
  from public.profiles
  where role = 'owner';

  if v_owner_count > 0 then
    raise exception 'an owner already exists; bootstrap is closed'
      using errcode = '42501';
  end if;
  if auth.uid() is null then
    raise exception 'bootstrap_owner requires an authenticated user'
      using errcode = '42501';
  end if;

  insert into public.profiles (id, full_name, role, is_active)
  values (auth.uid(), 'Owner', 'owner', true)
  on conflict (id) do update
    set role = 'owner',
        is_active = true,
        updated_at = now();

  insert into public.audit_logs (user_id, action, table_name, record_id, new_data)
  values (
    auth.uid(), 'bootstrap_owner', 'profiles', auth.uid(),
    jsonb_build_object('role', 'owner')
  );

  return jsonb_build_object(
    'user_id', auth.uid(),
    'role', 'owner',
    'bootstrapped', true
  );
end
$fn$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  new.updated_at := now();
  return new;
end
$fn$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into public.profiles (id, full_name, role, is_active)
  values (
    new.id,
    coalesce(
      nullif(btrim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
      nullif(btrim(coalesce(new.email, '')), ''),
      'User'
    ),
    'sales',
    true
  )
  on conflict (id) do nothing;

  return new;
end
$fn$;

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_old jsonb := null;
  v_new jsonb := null;
  v_record_id uuid := null;
begin
  if tg_op <> 'DELETE' then
    v_new := to_jsonb(new);
    v_record_id := (v_new->>'id')::uuid;
  end if;

  if tg_op <> 'INSERT' then
    v_old := to_jsonb(old);
    v_record_id := coalesce(v_record_id, (v_old->>'id')::uuid);
  end if;

  insert into public.audit_logs (
    user_id, action, table_name, record_id, old_data, new_data
  )
  values (
    auth.uid(), tg_op, tg_table_name, v_record_id, v_old, v_new
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$fn$;

do $trigger_setup$
declare
  t text;
begin
  -- updated_at triggers on every table (all tables have the column).
  for t in select unnest(array[
    'profiles', 'roles', 'store_settings', 'categories', 'brands',
    'customers', 'suppliers', 'products', 'product_serials', 'purchases',
    'purchase_items', 'supplier_payments', 'sales', 'sale_items',
    'sale_payments', 'held_carts', 'stock_movements', 'expenses',
    'returns', 'return_items', 'warranty_claims', 'cash_shifts',
    'cash_movements', 'audit_logs'
  ]) loop
    execute format('drop trigger if exists trg_set_updated_at_%I on public.%I', t, t);
    execute format(
      'create trigger trg_set_updated_at_%I before update on public.%I '
      || 'for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;

  -- Audit triggers only on the tables requested. audit_logs itself is never
  -- audited, which prevents recursion.
  for t in select unnest(array[
    'products', 'sales', 'customers', 'suppliers', 'purchases', 'expenses'
  ]) loop
    execute format('drop trigger if exists trg_audit_%I on public.%I', t, t);
    execute format(
      'create trigger trg_audit_%I after insert or update or delete on public.%I '
      || 'for each row execute function public.audit_trigger()',
      t, t
    );
  end loop;
end
$trigger_setup$;

drop trigger if exists on_auth_user_created_macintosh on auth.users;
create trigger on_auth_user_created_macintosh
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Read-only reports / dashboard
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_result jsonb;
  v_today date := current_date;
  v_month_start date := date_trunc('month', now())::date;
begin
  if not public.has_permission('dashboard.view') then
    raise exception 'permission denied: dashboard.view required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'today_sales_count', (
      select count(*) from public.sales
      where status = 'completed' and sale_date::date = v_today
    ),
    'today_sales_sum', (
      select coalesce(round(sum(total), 2), 0) from public.sales
      where status = 'completed' and sale_date::date = v_today
    ),
    'month_sales_sum', (
      select coalesce(round(sum(total), 2), 0) from public.sales
      where status = 'completed' and sale_date::date >= v_month_start
    ),
    'products_sold', (
      select coalesce(sum(si.quantity), 0)
      from public.sale_items si
      join public.sales s on s.id = si.sale_id
      where s.status = 'completed' and s.sale_date::date >= v_month_start
    ),
    'inventory_value', (
      select coalesce(round(sum(stock_quantity * coalesce(purchase_price, 0)), 2), 0)
      from public.products
      where not is_archived
    ),
    'low_stock_count', (
      select count(*) from public.products
      where not is_archived
        and reorder_level > 0
        and stock_quantity > 0
        and stock_quantity <= reorder_level
    ),
    'out_of_stock_count', (
      select count(*) from public.products
      where not is_archived and stock_quantity <= 0
    ),
    'customer_due_sum', (
      select coalesce(round(sum(due), 2), 0)
      from public.sales
      where status = 'completed'
    ),
    'supplier_due_sum', (
      select coalesce(round(sum(due), 2), 0)
      from public.purchases
      where status <> 'cancelled'
    ),
    'today_expenses', (
      select coalesce(round(sum(amount), 2), 0)
      from public.expenses
      where expense_date = v_today
    )
  )
  into v_result;

  return v_result;
end
$fn$;

create or replace function public.sales_report(
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_from date := coalesce(p_from, (current_date - interval '30 days')::date);
  v_to date := coalesce(p_to, current_date);
  v_profit_allowed boolean := public.has_permission('reports.profit');
  v_result jsonb;
begin
  if not (
    public.has_permission('reports.view')
    or public.has_permission('sales.view')
    or public.has_permission('reports.inventory')
  ) then
    raise exception 'permission denied: reports.view required' using errcode = '42501';
  end if;

  with
  base as (
    select *
    from public.sales
    where status = 'completed'
      and sale_date::date between v_from and v_to
  ),
  daily as (
    select
      sale_date::date as d,
      count(*) as cnt,
      round(sum(subtotal), 2) as sub,
      round(sum(discount), 2) as disc,
      round(sum(tax), 2) as tax,
      round(sum(delivery), 2) as del,
      round(sum(total), 2) as tot
    from base
    group by 1
  ),
  daily_profit as (
    select
      b.sale_date::date as d,
      round(sum(
        (si.unit_price - coalesce(pr.purchase_price, 0)) * si.quantity
        - coalesce(si.discount, 0)
      ), 2) as prof
    from base b
    join public.sale_items si on si.sale_id = b.id
    left join public.products pr on pr.id = si.product_id
    group by 1
  ),
  top_products as (
    select
      si.product_id,
      coalesce(max(pr.name), max(si.product_name), 'Unknown') as name,
      round(sum(si.quantity), 3) as qty,
      round(sum(si.subtotal), 2) as rev,
      round(sum(
        (si.unit_price - coalesce(pr.purchase_price, 0)) * si.quantity
        - coalesce(si.discount, 0)
      ), 2) as prof
    from base b
    join public.sale_items si on si.sale_id = b.id
    left join public.products pr on pr.id = si.product_id
    group by si.product_id
    order by rev desc
    limit 10
  ),
  category_totals as (
    select
      coalesce(c.name, 'Uncategorized') as name,
      round(sum(si.subtotal), 2) as rev,
      round(sum(
        (si.unit_price - coalesce(pr.purchase_price, 0)) * si.quantity
        - coalesce(si.discount, 0)
      ), 2) as prof
    from base b
    join public.sale_items si on si.sale_id = b.id
    left join public.products pr on pr.id = si.product_id
    left join public.categories c on c.id = pr.category_id
    group by coalesce(c.name, 'Uncategorized')
  ),
  employee_sales as (
    select
      employee_id,
      count(*) as cnt,
      round(sum(total), 2) as tot
    from base
    group by employee_id
  ),
  employee_profit as (
    select
      b.employee_id,
      round(sum(
        (si.unit_price - coalesce(pr.purchase_price, 0)) * si.quantity
        - coalesce(si.discount, 0)
      ), 2) as prof
    from base b
    join public.sale_items si on si.sale_id = b.id
    left join public.products pr on pr.id = si.product_id
    group by b.employee_id
  ),
  employee_totals as (
    select
      es.employee_id,
      coalesce(max(p.full_name), 'Unknown') as name,
      es.cnt,
      es.tot,
      ep.prof
    from employee_sales es
    left join public.profiles p on p.id = es.employee_id
    left join employee_profit ep on ep.employee_id = es.employee_id
    group by es.employee_id, es.cnt, es.tot, ep.prof
  )
  select jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'daily_totals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d.d,
        'sales_count', d.cnt,
        'subtotal', d.sub,
        'discount', d.disc,
        'tax', d.tax,
        'delivery', d.del,
        'total', d.tot,
        'profit', case when v_profit_allowed then dp.prof else null end
      ) order by d.d)
      from daily d
      left join daily_profit dp on dp.d = d.d
    ), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', tp.product_id,
        'name', tp.name,
        'quantity', tp.qty,
        'revenue', tp.rev,
        'profit', case when v_profit_allowed then tp.prof else null end
      ) order by tp.rev desc)
      from top_products tp
    ), '[]'::jsonb),
    'category_totals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', ct.name,
        'revenue', ct.rev,
        'profit', case when v_profit_allowed then ct.prof else null end
      ) order by ct.rev desc)
      from category_totals ct
    ), '[]'::jsonb),
    'employee_totals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', et.employee_id,
        'name', et.name,
        'sales_count', et.cnt,
        'total', et.tot,
        'profit', case when v_profit_allowed then et.prof else null end
      ) order by et.tot desc)
      from employee_totals et
    ), '[]'::jsonb),
    'profit_allowed', v_profit_allowed
  )
  into v_result;

  return v_result;
end
$fn$;

create or replace function public.inventory_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_result jsonb;
begin
  if not (
    public.has_permission('reports.inventory')
    or public.has_permission('inventory.view')
  ) then
    raise exception 'permission denied: reports.inventory required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'valuation', (
      select coalesce(round(sum(stock_quantity * coalesce(purchase_price, 0)), 2), 0)
      from public.products
      where not is_archived
    ),
    'retail_value', (
      select coalesce(round(sum(stock_quantity * selling_price), 2), 0)
      from public.products
      where not is_archived
    ),
    'total_products', (
      select count(*) from public.products where not is_archived
    ),
    'low_stock_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', p.id,
        'name', p.name,
        'sku', p.sku,
        'stock_quantity', p.stock_quantity,
        'reorder_level', p.reorder_level
      ) order by p.stock_quantity, p.name)
      from public.products p
      where not p.is_archived
        and p.reorder_level > 0
        and p.stock_quantity > 0
        and p.stock_quantity <= p.reorder_level
    ), '[]'::jsonb),
    'out_of_stock_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', p.id,
        'name', p.name,
        'sku', p.sku
      ) order by p.name)
      from public.products p
      where not p.is_archived and p.stock_quantity <= 0
    ), '[]'::jsonb),
    'movement_summary', coalesce((
      select jsonb_agg(jsonb_build_object(
        'movement_type', m.movement_type,
        'movements', m.cnt,
        'quantity', m.qty
      ) order by m.movement_type)
      from (
        select movement_type, count(*) as cnt, round(sum(quantity), 3) as qty
        from public.stock_movements
        where created_at >= now() - interval '30 days'
        group by movement_type
      ) m
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end
$fn$;

-- ---------------------------------------------------------------------------
-- approve_return: promotes a pending return and optionally restocks approved units.
-- ---------------------------------------------------------------------------
create or replace function public.approve_return(
  p_return_id uuid,
  p_restock boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_status text;
  v_previous numeric(12,3);
  v_new numeric(12,3);
  v_updated integer;
  v_item record;
begin
  if not public.has_permission('returns.approve') then
    raise exception 'permission denied: returns.approve required' using errcode = '42501';
  end if;

  select status into v_status
  from public.returns
  where id = p_return_id
  for update;

  if not found then
    raise exception 'return % does not exist', p_return_id;
  end if;
  if v_status is distinct from 'pending' then
    raise exception 'only pending returns can be approved';
  end if;

  update public.returns
  set status = 'approved',
      approved_by = auth.uid(),
      notes = notes
  where id = p_return_id;

  if coalesce(p_restock, false) then
    for v_item in
      select ri.*
      from public.return_items ri
      where ri.return_id = p_return_id
      order by ri.product_id
      for update
    loop
      select stock_quantity into v_previous
      from public.products
      where id = v_item.product_id
      for update;

      update public.products
      set stock_quantity = stock_quantity + v_item.quantity,
          updated_at = now(),
          updated_by = auth.uid()
      where id = v_item.product_id;
      get diagnostics v_updated = row_count;

      if v_updated <> 1 then
        raise exception 'restock failed for product %', v_item.product_id;
      end if;

      v_new := round(v_previous + v_item.quantity, 3);

      insert into public.stock_movements (
        product_id, movement_type, quantity, previous_quantity, new_quantity,
        reference, reason, employee_id
      ) values (
        v_item.product_id, 'return', v_item.quantity, v_previous, v_new,
        p_return_id::text, 'Approved pending return', auth.uid()
      );

      if v_item.serial_id is not null then
        update public.product_serials
        set status = 'returned', updated_at = now()
        where id = v_item.serial_id and product_id = v_item.product_id;
      end if;

      update public.return_items
      set restocked = true, restock_approved_by = auth.uid()
      where id = v_item.id;
    end loop;
  end if;

  insert into public.audit_logs (user_id, action, table_name, record_id, new_data)
  values (auth.uid(), 'approve_return', 'returns', p_return_id,
    jsonb_build_object('restocked', coalesce(p_restock, false)));

  return jsonb_build_object('return_id', p_return_id, 'status', 'approved', 'restocked', coalesce(p_restock, false));
end
$fn$;

-- ---------------------------------------------------------------------------
-- Execute privileges: no public/anon execution of the privileged API.
-- ---------------------------------------------------------------------------
revoke all on function public.has_permission(text, uuid) from public;
revoke all on function public.current_role() from public;
revoke all on function public.checkout(jsonb, uuid, jsonb, numeric, numeric, numeric, text, integer, uuid) from public;
revoke all on function public.receive_purchase(uuid, text, date, numeric, jsonb, jsonb, numeric, numeric) from public;
revoke all on function public.adjust_stock(uuid, numeric, text, text, text) from public;
revoke all on function public.process_return(uuid, jsonb, numeric, text, boolean) from public;
revoke all on function public.approve_return(uuid, boolean) from public;
revoke all on function public.create_cash_shift(numeric, text) from public;
revoke all on function public.close_cash_shift(uuid, numeric, text) from public;
revoke all on function public.cash_movement(uuid, text, numeric, text) from public;
revoke all on function public.apply_role(uuid, text) from public;
revoke all on function public.set_profile_active(uuid, boolean) from public;
revoke all on function public.bootstrap_owner() from public;
revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.audit_trigger() from public;
revoke all on function public.dashboard_stats() from public;
revoke all on function public.sales_report(date, date) from public;
revoke all on function public.inventory_report() from public;

grant execute on function public.has_permission(text, uuid) to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.checkout(jsonb, uuid, jsonb, numeric, numeric, numeric, text, integer, uuid) to authenticated;
grant execute on function public.receive_purchase(uuid, text, date, numeric, jsonb, jsonb, numeric, numeric) to authenticated;
grant execute on function public.adjust_stock(uuid, numeric, text, text, text) to authenticated;
grant execute on function public.process_return(uuid, jsonb, numeric, text, boolean) to authenticated;
grant execute on function public.approve_return(uuid, boolean) to authenticated;
grant execute on function public.create_cash_shift(numeric, text) to authenticated;
grant execute on function public.close_cash_shift(uuid, numeric, text) to authenticated;
grant execute on function public.cash_movement(uuid, text, numeric, text) to authenticated;
grant execute on function public.apply_role(uuid, text) to authenticated;
grant execute on function public.set_profile_active(uuid, boolean) to authenticated;
grant execute on function public.bootstrap_owner() to authenticated;
grant execute on function public.set_updated_at() to authenticated;
grant execute on function public.handle_new_user() to authenticated;
grant execute on function public.audit_trigger() to authenticated;
grant execute on function public.dashboard_stats() to authenticated;
grant execute on function public.sales_report(date, date) to authenticated;
grant execute on function public.inventory_report() to authenticated;
