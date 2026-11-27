# Macintosh BD POS — Recovery Checklist

Resumed session: recovered interrupted work. **Nothing was restarted, deleted, or overwritten.**

## Step 1 — Recovered state (inspection results)

- **Repository:** `https://github.com/ROVIXANE/macintosh-bd-pos.git`, branch `main`, working tree clean, up to date with `origin/main`.
- **Head commit:** `a7bfb68 ci: inject Supabase build configuration from repository secrets`.
- **Git history (not lost):** `a7bfb68` → `8c2df1a` → `cb335bb` → `2f66ea9` → `fbfd4c1` → `572bf45`.
- **Stack:** React 19 + TypeScript + Vite 7 + react-router-dom + `@supabase/supabase-js`, Tailwind, vitest + Testing Library, ESLint. GitHub Pages at base `/macintosh-bd-pos/`.
- **Structure:** `src/pages/*` (21 pages), `src/components/*`, `src/context/*`, `src/lib/*`, `supabase/migrations/*`, `supabase/tests/*`, `.github/workflows/deploy.yml`.
- **Supabase URL:** set in `.env` and GitHub repo secret `VITE_SUPABASE_URL`; project host `obukxsnevwddjzvodjov.supabase.co` responds.
- **No `TODO`/`FIXME`/stub markers** in `src` or `supabase`.

## Step 2 — What was already complete (recovered, untouched)

### Authentication & permissions
- [x] Supabase auth (`AuthContext`), `ProtectedRoute`, per-route permission gates.
- [x] Login page with Bengali/English toggle; first-user `bootstrap_owner()` flow (`SetupPage`).
- [x] Roles + granular permission keys; `has_permission`, `current_role`, `apply_role`, `set_profile_active` RPCs; Users page; audit log page.
- [x] Security-definer RPCs with pinned `search_path`; RLS enabled on every table; no secrets in migrations; `getEphemeralClient` avoids touching owner session for employee sign-up.

### POS
- [x] `POSPage`, cart, `checkout.ts`, payments, change calc, serial selection, held carts, receipt printing (`InvoicePrint`), idempotent `checkout` RPC.

### Inventory
- [x] `ProductsPage`, `InventoryPage`, `SerialsPage`, categories/brands, stock adjustment `adjust_stock`, stock movements ledger, `receive_purchase` stock-in.

### Customers & suppliers
- [x] `CustomersPage`, customer history, `SuppliersPage`, supplier payments.

### Purchases
- [x] `PurchasesPage`, purchase items, `receive_purchase` RPC.

### Invoices & printing
- [x] `InvoicesPage`, `InvoiceDetailPage`, invoice numbering, printable invoice; direct client writes to sales blocked by RLS.

### Returns & warranty
- [x] `ReturnsPage`, `process_return`, `approve_return`, `WarrantyPage`, `warranty_claims`.

### Expenses & cash
- [x] `ExpensesPage`, `CashPage`, cash shifts, `create_cash_shift`/`close_cash_shift`, `cash_movement`.

### Reports
- [x] `ReportsPage`, `dashboard_stats`, `sales_report`, `inventory_report`, `Charts`, `CashPage` stats.

### i18n, settings
- [x] English/Bengali (`LanguageContext`, `i18n.ts`), `SettingsPage`, `store_settings`, `SettingsContext`.

### Database
- [x] `supabase/migrations/00001_schema.sql` — 24 tables, constraints, indexes.
- [x] `00002_rls_policies.sql` — RLS + policies, `rls_current_role()`.
- [x] `00003_functions.sql` — permission API, transactional RPCs, triggers, reports, grants.
- [x] `00004_seed_reference.sql` — idempotent roles + `store_settings` seed.
- [x] `supabase/tests/rls_and_transaction_tests.sql` — commented BEGIN/ROLLBACK SQL suite.
- [x] `supabase/README.md` — apply order, verification queries, rollback notes.

### Tests
- [x] 44 unit tests / 6 files, all passing: `api.test`, `api.table.test`, `checkout.test`, `permissions.test`, `utils.test`, `validation.test`.

### CI/CD
- [x] `.github/workflows/deploy.yml` — typecheck → lint → test → build (with Supabase secrets) → SPA artifact check → Pages configure + deploy.
- [x] GitHub Pages enabled; `public/404.html` + SPA restore; `vite base=/macintosh-bd-pos/`.
- [x] GitHub secrets `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` present.
- [x] Latest `main` runs **success**; live URL returns HTTP 200.

## Step 3 — Broken / recovered this session

- [x] **Fixed `eslint.config.js` scaffold bug (was “broken code”).** It ignored `src`, targeted `app/**`, and referenced `app/vite-env.d.ts`, so `npm run lint` silently checked **nothing**. Repointed globs to `src/**`, removed `src` from `ignores`, context override to `src/context/*.tsx`. Real linting now runs and passes.

## Step 4 — Incomplete / blocked

- [x] **Publishable key verified.** Local `.env` `VITE_SUPABASE_PUBLISHABLE_KEY` = real `sb_publishable_*` key (not printed); key accepted by Supabase (no 401). `.env` confirmed git-ignored and never committed. GitHub secret `VITE_SUPABASE_PUBLISHABLE_KEY` replaced placeholder with the valid key; `VITE_SUPABASE_URL` set to `https://obukxsnevwddjzvodjov.supabase.co` (values not shown).
- [x] **Supabase connection verified with the existing app.** `checkConnection()` → `isSupabaseConfigured=true`, project reachable, `store_settings` not found (`PGRST205`). No service-role/secret key used anywhere.
- [ ] **CANNOT APPLY MIGRATIONS — AUTHORIZATION BLOCKER.** Remote `public` schema has no tables. Applying DDL requires Supabase **account authorization**, which is not available here: no `SUPABASE_ACCESS_TOKEN`, no DB password, no Supabase CLI; Supabase CLI (`supabase_linux_arm64` v3.4.0) downloaded but cannot execute on Android/bionic; **Management API rejects the publishable key (HTTP 401 “JWT could not be decoded”)**. **Everything is prepared — no manual SQL, no Supabase CLI:** `scripts/migrate.mjs` + `scripts/apply-migrations.sh` (Node + pure-JS `postgres`, ordered/idempotent transactional application, read-only verification of tables/RLS/policies/functions/seeds, auto `PROGRESS.md` update; secrets env-only/hidden, never printed/stored/committed; **publishable key refused for DDL**; no reset/drop). `supabase/config.toml`, `docs/MIGRATIONS.md`, manual fallback in `supabase/README.md`. **One action (cannot be automated):** provide ONE admin credential at the hidden prompt — DB **password** (Option 1, `SUPABASE_DB_URL`) or Supabase **personal access token** `sbp_...` (Option 2, `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`).
- [x] **Migrations syntactically validated** with the real PostgreSQL grammar (`libpg-query`, PG18 parser): `00001` 90 stmts, `00002` 83, `00003` 60, `00004` 2 — **235 statements parse clean**. Semantic application still requires the blocked DB access. SQL application NOT claimed.
- [ ] **SQL transaction suite not executed.** `supabase/tests/rls_and_transaction_tests.sql` requires local/dev Postgres with `service_role` (BEGIN/ROLLBACK); no DB available. Safe to run once migrations are applied on a dev DB.
- [ ] **Initial owner not created.** Requires tables + `handle_new_user` trigger; then sign up first user and `select public.bootstrap_owner();` (works even for a pre-existing auth user; fails once an owner exists; requires authenticated caller). NOT executed — **no secure owner credentials fabricated**.
- [ ] **Not verified end-to-end in a browser:** login + real `checkout` against live Supabase (blocked on migrations).

## Step 5 — Current errors

- None in TypeScript, ESLint, Vitest, or production build (all executed, all green).
- **Before this session:** runtime `Supabase … Invalid API key / HTTP 401` from placeholder key.
- **Now:** Supabase key accepted; remaining error is `PGRST205 … Could not find the table 'public.store_settings'` because **migrations are not applied** (authorization blocker). `checkConnection()` now reports the accurate “schema missing / apply migrations” message.

## Step 6 — Database status

- Migrations: 4 files, correct order, idempotent where documented; **235 statements parse clean** with real PostgreSQL parser; **not applied/verified against remote** (authorization blocker).
- RLS on every table; security-definer RPCs pinned `search_path`; transactional money/stock RPCs; audit triggers; role seed + `store_settings` seed; `handle_new_user` + `on_auth_user_created_macintosh`; `bootstrap_owner`.
- CLI status: **not installed** (official `supabase_linux_arm64` binary can't execute on Android/bionic). Prepared `supabase/config.toml` + `scripts/apply-migrations.sh`.
- `.env.example` documents required vars; `.env` present with **valid publishable key** (not printed); `.env` git-ignored.

## Step 7 — Deployment status

- Workflow `deploy.yml` syntactically intact; latest runs **success**; `dist` builds with `/macintosh-bd-pos/` base + 404 fallback.
- Live URL **https://rovixane.github.io/macintosh-bd-pos/** returns HTTP 200 (verified).
- **Live app verified reaching Supabase:** deployed bundle contains valid `sb_publishable_*` key (placeholder removed, value not printed); REST returns `PGRST205` (no tables), **not** 401. **Data features remain unavailable until migrations are applied** (authorization blocker).
- Session commit `77e2cf7` pushed; workflow run `45945430989` **success** (typecheck, lint, test, build, SPA check, Pages deploy); live URL re-verified HTTP 200.

## Next tasks (ordered)

1. **(Authorization blocker)** `bash scripts/apply-migrations.sh` → choose Option 1 (paste DB password→`SUPABASE_DB_URL`) or Option 2 (paste `sbp_...`→`SUPABASE_ACCESS_TOKEN`); hidden, nothing stored. Then migrations + verification + `PROGRESS.md` update run automatically. (Publishable key already valid & **not** needed again; it can't run DDL.)
2. Create first auth user; `select public.bootstrap_owner();`; smoke-test roles/permissions.
3. Run `supabase/tests/rls_and_transaction_tests.sql` on a **dev** database (service_role; BEGIN/ROLLBACK).
4. Browser smoke test: login → POS checkout → invoice print → inventory movement → purchase → return → expense → cash shift → reports → Bengali toggle.
5. Confirm redeploy run green on `main`; re-verify live URL + `/macintosh-bd-pos/` base + SPA 404 fallback.

## Executed checks (this session)

- `npm run typecheck` ✅
- `npm run lint` ✅ (after fixing broken `eslint.config.js`)
- `npm run test` ✅ **47/47, 7 files** (44 original + 3 new `supabase.test.ts`)
- `npm run test:scripts` ✅ **7/7** (`scripts/migrate-lib.test.mjs`, node:test; runs in CI)
- `npm run build` ✅
- Live URL HTTP 200 ✅; CI success ✅; Supabase host reachable ✅; **Supabase key valid ✅**; migrations syntactically valid ✅; **migrations applied ❌ (authorization blocker)**

<!-- MIGRATIONS:START -->
## Migration runner status (auto-generated 2026-11-27T05:53:06.257Z)
- Runner: `scripts/migrate.mjs` (Node, no Supabase CLI binary, no publishable key for DDL, no reset/drop).
- Migrations found & ordered: 4. Applied set: [].
- Route used: none (dry-run).
- DRY RUN: no database changes made.
- Credentials: read from environment only; never printed; not committed. Publishable key NOT used for DDL.
<!-- MIGRATIONS:END -->
