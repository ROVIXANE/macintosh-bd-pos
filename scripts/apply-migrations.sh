#!/usr/bin/env bash
# Safely apply Supabase migrations to the EXISTING project (never resets/deletes).
# Requires Supabase CLI + account authorization ONE of:
#   supabase login                                  # interactive, or
#   export SUPABASE_ACCESS_TOKEN=...                # personal access token, or
#   supabase link --project-ref ... --password ...  # database password
# NEVER commits secrets. Reads credentials from env/CLI store only.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-obukxsnevwddjzvodjov}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

command -v supabase >/dev/null 2>&1 || {
  echo "ERROR: supabase CLI not installed. See supabase/README.md." >&2
  echo "Manual fallback: paste migrations in order 00001->00004 into the SQL Editor." >&2
  exit 1
}

# Link to the existing project (does NOT create or reset anything).
supabase link --project-ref "$PROJECT_REF"

# Apply pending migrations in filename order. `db push` never drops data.
supabase db push

echo "Migrations applied. Verify with the read-only checks in supabase/README.md."
