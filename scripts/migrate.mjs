#!/usr/bin/env node
/**
 * Macintosh BD POS — safe Supabase migration runner for Android Termux / any Node env.
 *
 * NO Supabase CLI binary. NO publishable key for DDL. NOTHING is reset or dropped.
 * Applies supabase/migrations/*.sql in order, each in its own transaction, records
 * applied versions in supabase_migrations.schema_migrations (idempotent re-runs),
 * then runs READ-ONLY verification of tables / RLS / policies / functions / seeds
 * and updates PROGRESS.md between markers.
 *
 * Secure auth — provide ONE admin credential via ENV (never argv, never committed,
 * never printed). Prefer the safe wrapper scripts/apply-migrations.sh (hidden prompt).
 *
 *   Route A (direct PostgreSQL, official `postgres` driver, pure JS):
 *     SUPABASE_DB_URL="postgresql://postgres:PASSWORD@HOST:PORT/postgres"
 *       Supabase Dashboard -> Connect -> Connection string (URI). Session pooler
 *       (aws-0-REGION.pooler.supabase.com:5432) recommended on Android.
 *   Route B (Supabase Management API, official HTTPS, no DB password):
 *     SUPABASE_ACCESS_TOKEN="sbp_..."   (Dashboard -> Account -> Access Tokens)
 *       SUPABASE_PROJECT_REF="obukxsnevwddjzvodjov"  (optional; inferred from URL)
 *
 * The publishable key (VITE_*) is NEVER accepted for privileged DDL.
 *
 * Flags: --dry-run   list ordered migrations + status, no DB changes
 *        --no-progress  skip PROGRESS.md update
 */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { orderMigrations, extractVersion, checksum, assertNoTopLevelTxn, migrationScript, TRACKING_SETUP_SQL } from './migrate-lib.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const PROGRESS_FILE = join(REPO_ROOT, 'PROGRESS.md')
const PROGRESS_START = '<!-- MIGRATIONS:START -->'
const PROGRESS_END = '<!-- MIGRATIONS:END -->'

const EXPECTED_MIGRATIONS = ['00001_schema.sql', '00002_rls_policies.sql', '00003_functions.sql', '00004_seed_reference.sql']

const args = new Set(process.argv.slice(2))
const DRY_RUN = args.has('--dry-run')
const NO_PROGRESS = args.has('--no-progress')

function log(msg) { process.stdout.write(`${msg}\n`) }
function die(msg, code = 1) { process.stderr.write(`\nERROR: ${msg}\n`); process.exit(code) }

/** Redact anything that looks like a secret before printing. */
function redact(s) {
  return String(s)
    .replace(/postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/gi, 'postgres://<user>:<password>@')
    .replace(/sbp_[A-Za-z0-9]+/g, 'sbp_<redacted>')
    .replace(/sb_(publishable|secret)_[A-Za-z0-9_-]+/g, 'sb_$1_<redacted>')
    .replace(/eyJ[A-Za-z0-9_.-]+/g, '<jwt-redacted>')
}

// ---------- Load migrations --------------------------------------------------
async function loadMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) die(`migrations directory not found: ${MIGRATIONS_DIR}`)
  const files = await readdir(MIGRATIONS_DIR)
  const ordered = orderMigrations(files)

  const missing = EXPECTED_MIGRATIONS.filter((f) => !ordered.includes(f))
  if (missing.length) die(`expected migration file(s) missing: ${missing.join(', ')}`)

  const loaded = []
  for (const name of ordered) {
    const sql = await readFile(join(MIGRATIONS_DIR, name), 'utf8')
    assertNoTopLevelTxn(sql, name)
    loaded.push({ name, version: extractVersion(name), sql, checksum: checksum(sql) })
  }
  return loaded
}

// ---------- Read-only verification ------------------------------------------
const VERIFY_SQL = `
with pub as (
  select tablename, rowsecurity
  from pg_tables where schemaname = 'public'
),
pol as (
  select tablename, count(*)::int as policy_count
  from pg_policies where schemaname = 'public' group by tablename
),
req_fns as (
  select unnest(array[
    'has_permission','current_role','checkout','receive_purchase','adjust_stock',
    'process_return','approve_return','create_cash_shift','close_cash_shift',
    'cash_movement','apply_role','set_profile_active','bootstrap_owner',
    'dashboard_stats','sales_report','inventory_report','handle_new_user',
    'audit_trigger','set_updated_at','rls_current_role'
  ]) as proname
)
select
  (select count(*)::int from pub) as table_count,
  (select count(*)::int from pub where rowsecurity) as tables_with_rls,
  (select count(*)::int from pub where not rowsecurity) as tables_without_rls,
  coalesce((select jsonb_agg(tablename order by tablename) from pub where not rowsecurity), '[]'::jsonb) as tables_without_rls_names,
  (select count(*)::int from pg_policies where schemaname='public') as policy_count,
  coalesce((select jsonb_agg(p.tablename order by p.tablename) from pub p left join pol on pol.tablename=p.tablename where coalesce(pol.policy_count,0)=0), '[]'::jsonb) as tables_without_policies,
  (select count(*)::int from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace where n.nspname='public') as function_count,
  coalesce((
    select jsonb_agg(r.proname order by r.proname) from req_fns r
    where not exists (select 1 from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace where n.nspname='public' and pr.proname=r.proname)
  ), '[]'::jsonb) as missing_required_functions,
  (select count(*)::int from pg_proc pr join pg_namespace n on n.oid=pr.pronamespace
     where n.nspname='public' and pr.prosecdef
       and not (coalesce(pr.proconfig, array[]::text[])::text like '%search_path=%')) as security_definer_unpinned_search_path,
  (select count(*)::int from public.roles) as role_seed_count,
  (select count(*)::int from public.store_settings) as store_settings_count,
  (select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from supabase_migrations.schema_migrations) as applied_migrations;`

// ---------- DB route A: direct PostgreSQL via pure-JS `postgres` -------------
async function applyDirect(dbUrl, migrations) {
  const { default: postgres } = await import('postgres')
  const sql = postgres(dbUrl, { max: 1, idle_timeout: 5, connect_timeout: 20, onnotice: () => {} })
  try {
    await sql.unsafe(TRACKING_SETUP_SQL).simple()

    const appliedRows = await sql`select version, checksum from supabase_migrations.schema_migrations`
    const applied = new Map(appliedRows.map((r) => [r.version, r.checksum]))

    for (const m of migrations) {
      if (applied.has(m.version)) {
        const prev = applied.get(m.version)
        if (prev && prev !== m.checksum) log(`! ${m.name}: already applied but file changed since (checksum differs); NOT re-applying.`)
        else log(`= ${m.name}: already applied; skipping.`)
        continue
      }
      if (DRY_RUN) { log(`(dry-run) would apply ${m.name}`); continue }
      const script = migrationScript(m.sql, m.name, m.version, m.checksum)
      await sql.unsafe(script).simple() // single transaction: apply + record, rollback on error
      log(`+ ${m.name}: applied.`)
    }

    if (DRY_RUN) return { dryRun: true }
    const [verification] = await sql.unsafe(VERIFY_SQL).simple()
    return verification
  } finally {
    await sql.end({ timeout: 5 })
  }
}

// ---------- DB route B: Supabase Management API ------------------------------
async function runQueryApi(token, projectRef, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Management API HTTP ${res.status}: ${redact(text).slice(0, 300)}`)
  try { return text ? JSON.parse(text) : [] } catch { return [] }
}

async function applyManagementApi(token, projectRef, migrations) {
  await runQueryApi(token, projectRef, TRACKING_SETUP_SQL)
  const appliedRows = await runQueryApi(token, projectRef, 'select version, checksum from supabase_migrations.schema_migrations')
  const rows = Array.isArray(appliedRows) ? appliedRows : (appliedRows.result ?? appliedRows.data ?? [])
  const applied = new Map(rows.map((r) => [r.version, r.checksum]))

  for (const m of migrations) {
    if (applied.has(m.version)) { log(`= ${m.name}: already applied; skipping.`); continue }
    if (DRY_RUN) { log(`(dry-run) would apply ${m.name}`); continue }
    const script = migrationScript(m.sql, m.name, m.version, m.checksum)
    await runQueryApi(token, projectRef, script)
    log(`+ ${m.name}: applied.`)
  }
  if (DRY_RUN) return { dryRun: true }
  const result = await runQueryApi(token, projectRef, VERIFY_SQL)
  return Array.isArray(result) ? result[0] : (result.result?.[0] ?? result.data?.[0] ?? result)
}

function inferProjectRef() {
  const explicit = (process.env.SUPABASE_PROJECT_REF || '').trim()
  if (explicit) return explicit
  const raw = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const m = /https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(raw) || /@(?:db|aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com)[^/]*\/(?:postgres)?/i.exec(raw)
  const host = /@([^/@]+)/.exec(raw)
  const sub = /(?:https?:\/\/)?([a-z0-9]+)\.supabase\.co/i.exec(raw)
  if (sub) return sub[1]
  if (m) return m[1]
  if (host) { const h = host[1].split('.'); if (h.length && h[0].length === 20) return h[0] }
  return ''
}

// ---------- PROGRESS.md update ----------------------------------------------
async function updateProgress(status) {
  if (NO_PROGRESS || !existsSync(PROGRESS_FILE)) return
  let text = await readFile(PROGRESS_FILE, 'utf8')
  const body = [
    PROGRESS_START,
    `## Migration runner status (auto-generated ${new Date().toISOString()})`,
    '',
    `- Runner: \`scripts/migrate.mjs\` (Node, no Supabase CLI binary, no publishable key for DDL, no reset/drop).`,
    `- Migrations found & ordered: ${status.total}. Applied set: ${JSON.stringify(status.applied ?? [])}.`,
    `- Route used: ${status.route}.`,
    status.dryRun ? '- DRY RUN: no database changes made.' : `- Tables: ${status.table_count ?? '?'}; RLS on: ${status.tables_with_rls ?? '?'}; without RLS: ${status.tables_without_rls ?? '?'}.`,
    status.dryRun ? '' : `- Policies: ${status.policy_count ?? '?'}; tables without policies: ${JSON.stringify(status.tables_without_policies ?? [])}.`,
    status.dryRun ? '' : `- Functions: ${status.function_count ?? '?'}; missing required: ${JSON.stringify(status.missing_required_functions ?? [])}; security-definer w/o pinned search_path: ${status.security_definer_unpinned_search_path ?? '?'}.`,
    status.dryRun ? '' : `- Seeds: roles=${status.role_seed_count ?? '?'}; store_settings=${status.store_settings_count ?? '?'}.`,
    `- Credentials: read from environment only; never printed; not committed. Publishable key NOT used for DDL.`,
    PROGRESS_END,
  ].filter((l) => l !== '').join('\n')

  if (text.includes(PROGRESS_START) && text.includes(PROGRESS_END)) {
    text = text.replace(new RegExp(`${PROGRESS_START}[\\s\\S]*?${PROGRESS_END}`), body)
  } else {
    text = `${text.trimEnd()}\n\n${body}\n`
  }
  await writeFile(PROGRESS_FILE, text)
}

// ---------- Main -------------------------------------------------------------
async function main() {
  const migrations = await loadMigrations()
  log(`Found ${migrations.length} migration(s), ordered:`)
  for (const m of migrations) log(`  ${m.version}  ${m.name}  sha:${m.checksum}`)

  const dbUrl = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim()
  const token = (process.env.SUPABASE_ACCESS_TOKEN || '').trim()

  // Hard safety: refuse to run privileged DDL with a publishable/anon key.
  if (!dbUrl && !token) {
    log('\nNo admin credential found.')
    log('Everything else is prepared. Provide ONE of the following (securely, NOT as a CLI argument):')
    log('')
    log('  A) export SUPABASE_DB_URL="postgresql://postgres:PASSWORD@HOST:PORT/postgres"   # direct PostgreSQL (official pg driver)')
    log('     Supabase Dashboard -> Connect -> Connection string (URI). Session pooler recommended on Android Termux.')
    log('')
    log('  B) export SUPABASE_ACCESS_TOKEN="sbp_..."   # Supabase personal access token (Management API)')
    log('     Supabase Dashboard -> Account -> Access Tokens -> Generate new token.')
    log('     export SUPABASE_PROJECT_REF="obukxsnevwddjzvodjov"')
    log('')
    log('Safest: run scripts/apply-migrations.sh which prompts with hidden input and never stores anything.')
    log('\nThe publishable key (VITE_SUPABASE_PUBLISHABLE_KEY) is NOT valid for DDL and is refused.')
    if (DRY_RUN) { await updateProgress({ total: migrations.length, route: 'none (dry-run)', dryRun: true, applied: [] }); log('\n(dry-run listing only; nothing applied.)'); return }
    die('authorization blocker: no admin credential (SUPABASE_DB_URL or SUPABASE_ACCESS_TOKEN) provided.', 2)
  }

  // Refuse accidentally-supplied publishable key as the DB credential.
  if (!dbUrl && token && (token.startsWith('sb_publishable_') || token.startsWith('eyJ'))) {
    die('SUPABASE_ACCESS_TOKEN looks like a publishable/anon key, not a Supabase personal access token (sbp_...). Refusing privileged DDL.', 2)
  }

  if (DRY_RUN) { /* still try to list applied status */ }

  const route = dbUrl ? 'direct-postgres' : 'management-api'
  log(`\nRoute: ${route}. Applying in order, each migration in its own transaction (no reset, no drop).`)

  let verification
  if (dbUrl) {
    verification = await applyDirect(dbUrl, migrations)
  } else {
    const projectRef = inferProjectRef()
    if (!projectRef) die('could not determine Supabase project ref; set SUPABASE_PROJECT_REF.')
    verification = await applyManagementApi(token, projectRef, migrations)
  }

  if (verification && verification.dryRun) {
    await updateProgress({ total: migrations.length, route, dryRun: true, applied: migrations.map((m) => m.version) })
    return
  }

  log('\n--- Read-only verification ---')
  log(JSON.stringify(verification, null, 2))

  const missingFns = verification?.missing_required_functions ?? []
  const noRls = verification?.tables_without_rls ?? 0
  const ok = noRls === 0 && missingFns.length === 0

  await updateProgress({ total: migrations.length, route, ...verification })

  if (!ok) die(`verification reported issues: tables_without_rls=${noRls}, missing_required_functions=${JSON.stringify(missingFns)}`, 3)
  log('\nMigrations applied and verified. PROGRESS.md updated.')
}

main().catch((err) => die(redact(err?.message || err)))
