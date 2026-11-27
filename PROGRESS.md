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

- [ ] **Supabase runtime connection — CREDENTIAL BLOCKER.** No *valid* publishable/anon key available:
  - local `.env` `VITE_SUPABASE_PUBLISHABLE_KEY` = placeholder `তোমার_আগের_publishable_key` (length 26; `Invalid API key`, HTTP 401);
  - GitHub secret `VITE_SUPABASE_PUBLISHABLE_KEY` = same Bengali placeholder (found in deployed bundle; secret values are not readable);
  - `VITE_SUPABASE_URL` is a real project host, but without a key no schema/auth verification is possible.
  **Needed:** user supplies the real Supabase publishable (anon) key → set in `.env` + GitHub secret `VITE_SUPABASE_PUBLISHABLE_KEY`, rebuild, and confirm `checkConnection()` = connected.
- [ ] **Cannot verify remote DB migrations applied.** Migration files are complete; application state in the remote project is unknown without a key. (No local Postgres/Supabase CLI available to dry-run SQL.)
- [ ] **SQL transaction suite not executed.** `supabase/tests/rls_and_transaction_tests.sql` requires a local/dev Postgres with `service_role`; no DB tooling in this environment.
- [ ] **Not verified end-to-end in a browser:** auth login + a real `checkout` against live Supabase (blocked on valid key).

## Step 5 — Current errors

- None in TypeScript, ESLint, Vitest, or production build (all executed, all green).
- Runtime `Supabase … Invalid API key / HTTP 401` when reaching remote Supabase with placeholder key (local check; live page itself serves 200).

## Step 6 — Database status

- Migrations: 4 files, correct order, idempotent where documented. **Not applied/verified against remote** (no valid credentials).
- RLS on every table; security-definer RPCs pinned `search_path`; transactional money/stock RPCs; audit triggers; role seed + `store_settings` seed.
- `.env.example` documents required vars; `.env` present but key is placeholder.

## Step 7 — Deployment status

- Workflow `deploy.yml` syntactically intact; latest runs **success**; `dist` builds with `/macintosh-bd-pos/` base + 404 fallback.
- Live URL **https://rovixane.github.io/macintosh-bd-pos/** returns HTTP 200 (verified).
- Live app’s Supabase connectivity will fail until the placeholder key is replaced (see blocker).
- Changes this session will redeploy on push to `main`.

## Next tasks (ordered)

1. **(Blocker — user action)** Provide real Supabase publishable key; set `.env` + GitHub secret; rebuild; verify `checkConnection()`.
2. Apply migrations `00001`→`00004` in remote Supabase (SQL editor / CLI); run verification queries in `supabase/README.md`.
3. Create first auth user; `select public.bootstrap_owner();`; smoke-test roles/permissions.
4. Run `supabase/tests/rls_and_transaction_tests.sql` on a **dev** database (service_role; BEGIN/ROLLBACK).
5. Browser smoke test: login → POS checkout → invoice print → inventory movement → purchase → return → expense → cash shift → reports → Bengali toggle.
6. Confirm redeploy run green on `main`; re-verify live URL + `/macintosh-bd-pos/` base + SPA 404 fallback.

## Executed checks (this session)

- `npm run typecheck` ✅
- `npm run lint` ✅ (after fixing broken `eslint.config.js`)
- `npm run test` ✅ 44/44
- `npm run build` ✅
- Live URL HTTP 200 ✅; GitHub secrets present ✅; CI runs success ✅; Supabase host reachable ✅; **Supabase key validity ❌ (placeholder)**
