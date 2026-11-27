#!/usr/bin/env node
/**
 * Phase-2 integration test against a REAL PostgreSQL database (not supabase-js/PostgREST).
 * Applies migrations 00001->00004, then verifies on a throwaway DB (BEGIN...ROLLBACK is NOT
 * used here; run only against a disposable local database, NEVER production):
 *   - first-user trigger + bootstrap_owner (secure, idempotent, no pre-existing owner)
 *   - role permissions + RLS (anon vs sales vs owner); no security weakening
 *   - real CRUD: products, customers, suppliers, inventory stock, expenses
 *   - transactional checkout RPC: stock decrement, payments, invoice number, serial
 *     validation, over-stock rejection, atomic rollback, idempotency key
 *   - dashboard_stats reads REAL database data
 * No service_role key used; `postgres` test role only; nothing printed that is secret.
 * NOT part of the shipped app. Requires a local/disposable PostgreSQL + applied migrations.
 *
 * Usage: node scripts/integration-test-db.mjs <DATABASE_URL>
 */
import postgres from 'postgres'

const DB_URL = process.argv[2] || process.env.IT_DATABASE_URL
if (!DB_URL) { console.error('provide a disposable DATABASE_URL'); process.exit(2) }

const sql = postgres(DB_URL, { max: 1, onnotice: () => {} })
let passed = 0
let failed = 0
const failures = []

function ok(name, cond, extra = '') {
  if (cond) { passed++; console.log(`PASS ${name}`) }
  else { failed++; failures.push(name); console.log(`FAIL ${name} ${extra}`) }
}

async function expectError(name, fn, match) {
  try { await fn(); ok(name, false, '(no error thrown)') }
  catch (e) { ok(name, !match || match.test(String(e.message)), `(${e.message})`) }
}

// run `fn` as `role` with JWT sub set, then reset
async function as(role, uid, fn) {
  // session-level (is_local=false) so role + JWT claim persist across statements on this connection
  await sql`select set_config('role', ${role}, false)`
  await sql`select set_config('request.jwt.claim.sub', ${uid ?? ''}, false)`
  try { return await fn() }
  finally {
    await sql`reset role`.catch(() => {})
    await sql`select set_config('request.jwt.claim.sub', '', false)`.catch(() => {})
  }
}

async function main() {
  const OWNER = '11111111-1111-1111-1111-111111111111'
  const SALES = '22222222-2222-2222-2222-222222222222'

  // --- 1) first user trigger + bootstrap_owner ------------------------------
  await sql`insert into auth.users (id, email, raw_user_meta_data) values (${OWNER}, 'owner@test.local', '{"full_name":"Owner"}'::jsonb)`
  const prof = await sql`select id, role, is_active from public.profiles where id = ${OWNER}`
  ok('handle_new_user created profile with role sales', prof.length === 1 && prof[0].role === 'sales' && prof[0].is_active === true)

  const noOwnerBefore = await sql`select count(*)::int n from public.profiles where role = 'owner'`
  ok('no pre-existing owner required before bootstrap', noOwnerBefore[0].n === 0)

  const boot = await as('authenticated', OWNER, () => sql`select public.bootstrap_owner() as r`)
  ok('bootstrap_owner promotes first caller to owner', boot[0].r.role === 'owner' && boot[0].r.user_id === OWNER)

  // idempotent: second call fails cleanly, no duplicate owner
  await expectError('bootstrap_owner second call rejected (already owner)', () => as('authenticated', OWNER, () => sql`select public.bootstrap_owner()`), /owner already exists/i)
  const ownerCount = await sql`select count(*)::int n from public.profiles where role = 'owner'`
  ok('exactly one owner after repeated bootstrap', ownerCount[0].n === 1)

  // anon cannot bootstrap
  await expectError('anon cannot call bootstrap_owner', () => as('anon', null, () => sql`select public.bootstrap_owner()`))

  // --- sales employee -------------------------------------------------------
  await sql`insert into auth.users (id, email) values (${SALES}, 'sales@test.local')`
  await as('authenticated', OWNER, () => sql`select public.apply_role(${SALES}, 'sales')`)

  // --- 2) permissions -------------------------------------------------------
  const ownerPerm = await as('authenticated', OWNER, () => sql`select public.has_permission('apply_role') as p`)
  ok('owner has apply_role permission', ownerPerm[0].p === true)
  const salesPerm = await as('authenticated', SALES, () => sql`select public.has_permission('inventory.adjust') as p`)
  ok('sales lacks inventory.adjust', salesPerm[0].p === false)
  await expectError('sales cannot apply_role', () => as('authenticated', SALES, () => sql`select public.apply_role(${SALES}, 'owner')`), /permission denied/i)

  // --- 3) RLS ---------------------------------------------------------------
  await sql`insert into public.customers (name) values ('RLS Probe')`
  const anonRead = await as('anon', null, async () => { try { return (await sql`select count(*)::int n from public.customers`)[0].n } catch { return -1 } })
  ok('anon cannot read customers (RLS)', anonRead === -1 || anonRead === 0)
  // strict: anon write blocked
  await expectError('anon cannot insert products (RLS)', () => as('anon', null, () => sql`insert into public.products (name, sku, selling_price) values ('x','x',1)`))
  // sales cannot adjust stock directly (must use RPC); checked with a real product below

  // --- 4) real CRUD as owner ------------------------------------------------
  await as('authenticated', OWNER, async () => {
    // products
    const [p] = await sql`insert into public.products (name, sku, selling_price, purchase_price, stock_quantity) values ('Test Laptop','SKU-IT-1',1000,600,10) returning id, name, sku`
    ok('CRUD product insert', p.name === 'Test Laptop')
    const [p2] = await sql`update public.products set selling_price = 1100 where id = ${p.id} returning selling_price`
    ok('CRUD product update', Number(p2.selling_price) === 1100)
    // sales cannot update stock directly: RLS silently affects 0 rows, value unchanged
    const stockBeforeSales = Number((await sql`select stock_quantity from public.products where id = ${p.id}`)[0].stock_quantity)
    // temporarily become sales on this same connection (no nested role reset)
    await sql`select set_config('request.jwt.claim.sub', ${SALES}, false)`
    await sql`update public.products set stock_quantity = 999 where id = ${p.id}`
    await sql`select set_config('request.jwt.claim.sub', ${OWNER}, false)` // restore owner claim
    const stockAfterSales = Number((await sql`select stock_quantity from public.products where id = ${p.id}`)[0].stock_quantity)
    ok('sales cannot update stock_quantity directly (RLS, 0 rows)', stockAfterSales === stockBeforeSales, `before=${stockBeforeSales} after=${stockAfterSales}`)
    const pc = await sql`select count(*)::int n from public.products where id = ${p.id}`
    ok('CRUD product read', pc[0].n === 1)

    // customers
    const [c] = await sql`insert into public.customers (name, phone) values ('Cust One','01700') returning id`
    ok('CRUD customer insert', !!c.id)
    const [c2] = await sql`update public.customers set phone = '01800' where id = ${c.id} returning phone`
    ok('CRUD customer update', c2.phone === '01800')

    // suppliers
    const [s] = await sql`insert into public.suppliers (name) values ('Supplier One') returning id, name`
    ok('CRUD supplier insert', s.name === 'Supplier One')

    // inventory stock adjustment via RPC
    const adj = await sql`select public.adjust_stock(${p.id}, 5, 'adjustment', 'restock', null) as r`
    const stockAfter = (await sql`select stock_quantity from public.products where id = ${p.id}`)[0].stock_quantity
    ok('adjust_stock increments inventory', Number(stockAfter) === 15, `stock=${stockAfter}`)
    const mov = await sql`select movement_type, quantity from public.stock_movements where product_id = ${p.id} order by created_at desc limit 1`
    ok('stock movement recorded', mov.length === 1 && Number(mov[0].quantity) === 5)
    ok('adjust_stock returns json', typeof adj[0].r === 'object')

    // expenses
    const [e] = await sql`insert into public.expenses (category, amount, expense_date) values ('rent', 5000, current_date) returning id, amount`
    ok('CRUD expense insert', Number(e.amount) === 5000)

    // checkout transactional RPC -------------------------------------------
    const items = [{ product_id: p.id, quantity: 2, unit_price: 1100, discount: 0, serial_id: null }]
    const payments = [{ method: 'cash', amount: 2200, reference: null }]
    const before = Number((await sql`select stock_quantity from public.products where id = ${p.id}`)[0].stock_quantity)
    const key = 'it-key-' + Date.now()
    const r1 = await sql`select public.checkout(${sql.json(items)}, null, ${sql.json(payments)}, 0, 0, 0, ${key}, 0, null) as r`
    const inv1 = r1[0].r.invoice_number
    ok('checkout returns invoice number', typeof inv1 === 'string' && inv1.length > 0, JSON.stringify(r1[0].r))
    const after = Number((await sql`select stock_quantity from public.products where id = ${p.id}`)[0].stock_quantity)
    ok('checkout decrements stock atomically', after === before - 2, `before=${before} after=${after}`)
    const pay = await sql`select method, amount from public.sale_payments sp join public.sales s on s.id=sp.sale_id where s.invoice_number = ${inv1}`
    ok('payment recorded', pay.length === 1 && Number(pay[0].amount) === 2200)
    const saleRow = await sql`select total, paid, due, status from public.sales where invoice_number = ${inv1}`
    ok('sale totals correct', Number(saleRow[0].total) === 2200 && Number(saleRow[0].due) === 0 && saleRow[0].status === 'completed')

    // idempotency
    const r2 = await sql`select public.checkout(${sql.json(items)}, null, ${sql.json(payments)}, 0, 0, 0, ${key}, 0, null) as r`
    ok('checkout idempotency key returns same invoice', r2[0].r.invoice_number === inv1)
    const saleCount = await sql`select count(*)::int n from public.sales where invoice_number = ${inv1}`
    ok('idempotent checkout created one sale', saleCount[0].n === 1)

    // over-stock rejection + atomic rollback
    const beforeOver = Number((await sql`select stock_quantity from public.products where id = ${p.id}`)[0].stock_quantity)
    await expectError('checkout over stock rejected', () => sql`select public.checkout(${sql.json([{ product_id: p.id, quantity: 9999, unit_price: 1100, discount: 0, serial_id: null }])}, null, ${sql.json(payments)}, 0,0,0, ${'over-' + Date.now()},0,null)`, /stock/i)
    const afterOver = Number((await sql`select stock_quantity from public.products where id = ${p.id}`)[0].stock_quantity)
    ok('failed checkout leaves stock unchanged (atomic)', afterOver === beforeOver)

    // serialized product serial validation
    const [sp] = await sql`insert into public.products (name, sku, selling_price, stock_quantity, is_serialized) values ('Serial Phone','SKU-SER',500,1,true) returning id`
    const [ser] = await sql`insert into public.product_serials (product_id, serial_number, status) values (${sp.id}, 'SN-001', 'in_stock') returning id`
    await expectError('serialized checkout requires valid in-stock serial', () => sql`select public.checkout(${sql.json([{ product_id: sp.id, quantity: 1, unit_price: 500, discount: 0, serial_id: null }])}, null, ${sql.json([{ method: 'cash', amount: 500, reference: null }])}, 0,0,0, ${'ser-null-' + Date.now()},0,null)`, /serial/i)
    const serSale = await sql`select public.checkout(${sql.json([{ product_id: sp.id, quantity: 1, unit_price: 500, discount: 0, serial_id: ser.id }])}, null, ${sql.json([{ method: 'cash', amount: 500, reference: null }])}, 0,0,0, ${'ser-ok-' + Date.now()},0,null) as r`
    ok('serialized checkout succeeds', !!serSale[0].r.invoice_number)
    const serStatus = (await sql`select status from public.product_serials where id = ${ser.id}`)[0].status
    ok('serialized checkout marks serial sold', serStatus === 'sold', `status=${serStatus}`)

    // dashboard real data --------------------------------------------------
    const dash = await sql`select public.dashboard_stats() as r`
    const d = dash[0].r
    ok('dashboard_stats reads real DB', d && Number(d.today_sales_count) >= 1 && Number(d.today_sales_sum) >= 2200, JSON.stringify(d))
    ok('dashboard inventory_value real', Number(d.inventory_value) >= 0)
  })
}

main()
  .then(() => sql.end())
  .then(() => { console.log(`\nRESULT passed=${passed} failed=${failed}`); if (failed) { console.log('failures:', failures.join('; ')); process.exit(1) } })
  .catch((e) => { console.error('FATAL', e); return sql.end().then(() => process.exit(1)) })
