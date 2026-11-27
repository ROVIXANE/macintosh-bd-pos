# Apply Supabase migrations on Android Termux (no SQL copying, no Supabase CLI)

You already have a **valid publishable key** in `.env`. That key powers the app,
but **it cannot run privileged database migrations (DDL)**. Applying the four
files in `supabase/migrations/` needs **one admin credential** that is *not* the
publishable key. Everything else is automated.

## What the runner does (automatically)

`scripts/migrate.mjs` + `scripts/apply-migrations.sh`:

1. Reads `supabase/migrations/*.sql`, **orders `00001 → 00004`**, verifies a
   contiguous gapless sequence, and **rejects duplicates**.
2. **Refuses top-level `begin/commit/rollback`** inside files; wraps each
   migration in **its own transaction** (apply + record = atomic; rollback on error).
3. **Never resets, never drops, never deletes.** `create table if not exists`,
   `create or replace`, `drop trigger if exists` + recreate, `on conflict do nothing`.
4. **Idempotent / duplicate-safe.** Creates `supabase_migrations.schema_migrations`
   and **skips already-applied versions** (with checksum compare); safe to re-run.
5. Uses a **DB advisory lock** so two runs can't apply concurrently.
6. **Read-only verification** afterwards: table count, **RLS on every table**,
   **policies per table**, function count, **required RPCs present**, **security-definer
   functions have pinned `search_path`**, **role + `store_settings` seeds**, applied list.
7. **Updates `PROGRESS.md`** automatically between `<!-- MIGRATIONS:START/END -->`.
8. **No credentials printed, stored, or committed.** No publishable key for DDL.
   No service-role key in frontend. Reads secrets from **environment only**;
   hidden interactive prompt; `trap` unsets on exit.

## No Supabase CLI needed

Node.js + `postgres` (pure-JavaScript driver, no native build) is used.
`pkg install nodejs`. (Official `supabase` CLI binary can't run on Android/bionic.)

## Run it

```bash
# safest — hidden prompts, nothing stored:
bash scripts/apply-migrations.sh
```

Choose **1** (direct PostgreSQL) or **2** (personal access token).

### Option 1 — Direct PostgreSQL (recommended on Termux)

Supabase Dashboard → **Connect** → **Connection string → URI**. Pick **Session pooler**
(`aws-0-REGION.pooler.supabase.com:5432`) for Android; paste it when prompted (hidden).
User `postgres`, your **database password** (Dashboard → Database → reset/set). Form:

```
postgresql://postgres.REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

### Option 2 — Supabase Management API (no DB password)

Supabase Dashboard → **Account → Access Tokens → Generate new token** (`sbp_...`).
Choose **2**, paste token (hidden), confirm project ref `obukxsnevwddjzvodjov`.
Uses official HTTPS `POST /v1/projects/{ref}/database/query`. *(No DB password.)*

### Non-interactive (CI/advanced) — env only, never argv

```bash
export SUPABASE_DB_URL='postgresql://postgres:PASSWORD@HOST:PORT/postgres'
node scripts/migrate.mjs
# or
export SUPABASE_ACCESS_TOKEN='sbp_...'
export SUPABASE_PROJECT_REF='obukxsnevwddjzvodjov'
node scripts/migrate.mjs
```

### Preview without touching the database

```bash
node scripts/migrate.mjs --dry-run
```

## The single authorization step (cannot be automated)

We **cannot** create your admin credential for you (by design, secrets are never
printed or stored). At the prompt, provide **one** of:

- your **database password** (for Option 1), or
- a **Supabase personal access token** `sbp_...` (for Option 2).

Your **publishable key is not accepted** here. After this one step, everything
(migrations, verification, `PROGRESS.md`) runs automatically.

## Tests

```bash
npm run test:scripts   # node --test scripts/  (ordering, idempotency, safety)
```
