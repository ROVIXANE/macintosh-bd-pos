// Pure helpers for the migration runner (no I/O, no secrets). Testable offline.

/** Numeric prefix of a migration file name, e.g. 00001_schema.sql -> "00001". */
export function extractVersion(fileName) {
  const m = /^(\d{5})_[A-Za-z0-9_.-]+\.sql$/.exec(fileName)
  if (!m) throw new Error(`Unrecognized migration file name: ${fileName} (expected NNNNN_name.sql)`)
  return m[1]
}

/**
 * Sort migration file names ascending and verify a contiguous, gapless,
 * duplicate-free sequence starting at 00001. Returns ordered file names.
 */
export function orderMigrations(fileNames) {
  const sql = fileNames.filter((f) => f.endsWith('.sql'))
  const withV = sql.map((f) => ({ f, v: extractVersion(f) }))
  withV.sort((a, b) => (a.v < b.v ? -1 : a.v > b.v ? 1 : 0))

  const versions = withV.map((x) => x.v)
  const dupes = versions.filter((v, i) => versions.indexOf(v) !== i)
  if (dupes.length) throw new Error(`Duplicate migration version(s): ${[...new Set(dupes)].join(', ')}`)

  for (let i = 0; i < versions.length; i++) {
    const expected = String(i + 1).padStart(5, '0')
    if (versions[i] !== expected) {
      throw new Error(`Migration sequence gap: expected ${expected}, found ${versions[i]}. Files must be 00001..NNNNN contiguous.`)
    }
  }
  return withV.map((x) => x.f)
}

/** Stable non-secret fingerprint of file content (FNV-1a). */
export function checksum(text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

/** Verify no top-level transaction control would fight our wrapping BEGIN/COMMIT. */
export function assertNoTopLevelTxn(sqlText, fileName) {
  // Strip dollar-quoted bodies ($$..$$ / $tag$..$tag$) and line comments.
  const noDollar = sqlText.replace(/\$[A-Za-z0-9_]*\$[\s\S]*?\$[A-Za-z0-9_]*\$/g, ' ')
  const noComments = noDollar.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
  const re = /(^|;)\s*(begin|commit|rollback|start\s+transaction|end)\s*(;|$)/i
  if (re.test(noComments)) {
    throw new Error(`${fileName}: top-level transaction control detected; remove it (runner manages transactions).`)
  }
}

/** Build the per-migration transactional script (apply + record). */
export function migrationScript(sqlText, fileName, version, checksumHex, trackingSchema = 'supabase_migrations', trackingTable = 'schema_migrations') {
  return [
    'begin;',
    `select pg_advisory_xact_lock(hashtext('macintosh-bd-pos-migrations'));`,
    sqlText.trim(),
    `insert into ${trackingSchema}.${trackingTable} (version, name, checksum, applied_at)`,
    `values (${quote(version)}, ${quote(fileName)}, ${quote(checksumHex)}, now());`,
    'commit;',
  ].join('\n')
}

/** Single-quote a SQL string literal safely. */
export function quote(s) {
  return `'${String(s).replace(/'/g, "''")}'`
}

/** DDL to create the tracking table idempotently (non-destructive). */
export const TRACKING_SETUP_SQL = `
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  name text,
  checksum text,
  applied_at timestamptz not null default now()
);`.trim()
