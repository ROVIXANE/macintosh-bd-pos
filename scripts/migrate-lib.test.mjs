import test from 'node:test'
import assert from 'node:assert/strict'
import { extractVersion, orderMigrations, checksum, assertNoTopLevelTxn, migrationScript, quote } from './migrate-lib.mjs'

test('extractVersion parses NNNNN_name.sql', () => {
  assert.equal(extractVersion('00001_schema.sql'), '00001')
  assert.throws(() => extractVersion('schema.sql'), /Unrecognized/)
  assert.throws(() => extractVersion('1_schema.sql'), /Unrecognized/)
})

test('orderMigrations sorts, filters, and rejects gaps/dupes', () => {
  assert.deepEqual(
    orderMigrations(['00002_rls.sql', '00001_schema.sql', 'README.md', '00004_seed.sql', '00003_functions.sql']),
    ['00001_schema.sql', '00002_rls.sql', '00003_functions.sql', '00004_seed.sql'],
  )
  assert.throws(() => orderMigrations(['00001_a.sql', '00003_b.sql']), /gap/)
  assert.throws(() => orderMigrations(['00001_a.sql', '00001_b.sql']), /Duplicate/)
  assert.throws(() => orderMigrations(['00002_a.sql']), /gap/)
})

test('checksum is stable and content-sensitive', () => {
  assert.equal(checksum('abc'), checksum('abc'))
  assert.notEqual(checksum('abc'), checksum('abd'))
  assert.match(checksum('x'), /^[0-9a-f]{8}$/)
})

test('assertNoTopLevelTxn ignores PL/pgSQL begin/end inside dollar bodies', () => {
  const sql = `create or replace function f() returns void language plpgsql as $fn$ begin null; end; $fn$;`
  assert.doesNotThrow(() => assertNoTopLevelTxn(sql, 'x.sql'))
})

test('assertNoTopLevelTxn rejects real top-level transaction control', () => {
  assert.throws(() => assertNoTopLevelTxn('begin; select 1; commit;', 'x.sql'), /transaction control/)
  assert.throws(() => assertNoTopLevelTxn('select 1; rollback;', 'x.sql'), /transaction control/)
})

test('migrationScript wraps apply + record in one transaction with advisory lock', () => {
  const out = migrationScript('select 1;', '00001_x.sql', '00001', 'deadbeef')
  assert.match(out, /^begin;/m)
  assert.match(out, /pg_advisory_xact_lock/)
  assert.match(out, /insert into supabase_migrations\.schema_migrations/)
  assert.match(out, /commit;$/m)
})

test('quote escapes single quotes', () => {
  assert.equal(quote("a'b"), `'a''b'`)
})
