#!/usr/bin/env bash
# Macintosh BD POS — beginner-friendly, secure migration wrapper for Android Termux.
#
# No Supabase CLI binary. No SQL to copy. No publishable key for DDL.
# Nothing is reset, dropped, or overwritten; applied migrations are skipped.
#
# Secure authorization (choose ONE):
#   A) SUPABASE_DB_URL   full PostgreSQL connection string (includes password)  [recommended on Termux]
#   B) SUPABASE_ACCESS_TOKEN  Supabase personal access token (sbp_...) + SUPABASE_PROJECT_REF
#
# Credentials are read with HIDDEN input, kept in memory only, passed via env to
# Node, never written to disk, never committed, never printed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js is required (Termux: pkg install nodejs)." >&2; exit 1; }

MODE="${1:-}"

# Pass-through flags.
EXTRA=()
for a in "$@"; do
  case "$a" in
    --dry-run|--no-progress) EXTRA+=("$a") ;;
  esac
done

if [[ "$MODE" == "--dry-run" ]]; then
  exec node scripts/migrate.mjs --dry-run
fi

echo "Macintosh BD POS — safe Supabase migration runner"
echo "-------------------------------------------------"
echo "Choose secure admin authorization (nothing is stored; input hidden):"
echo "  1) Direct PostgreSQL connection string   (SUPABASE_DB_URL)   [recommended]"
echo "  2) Supabase personal access token        (SUPABASE_ACCESS_TOKEN + project ref)"
read -rp "Choice [1/2]: " CHOICE

if [[ "$CHOICE" == "2" ]]; then
  # Hidden prompt; token never echoed; not exported to disk.
  read -rs -p "Paste Supabase personal access token (sbp_...): " SUPABASE_ACCESS_TOKEN
  echo
  export SUPABASE_ACCESS_TOKEN
  if [[ -z "${SUPABASE_PROJECT_REF:-}" ]]; then
    read -rp "Supabase project ref [obukxsnevwddjzvodjov]: " REF
    export SUPABASE_PROJECT_REF="${REF:-obukxsnevwddjzvodjov}"
  fi
else
  echo "Paste your PostgreSQL connection URI (from Supabase Dashboard -> Connect)."
  echo "Example form: postgresql://postgres.REF:PASSWORD@HOST:PORT/postgres"
  read -rs -p "Connection string (hidden): " SUPABASE_DB_URL
  echo
  export SUPABASE_DB_URL
fi

trap 'unset SUPABASE_DB_URL SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_REF' EXIT

exec node scripts/migrate.mjs "${EXTRA[@]}"
