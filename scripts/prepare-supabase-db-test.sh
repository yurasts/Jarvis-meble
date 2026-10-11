#!/usr/bin/env bash
set -euo pipefail

# The remote history predates the repository baseline. Build a throwaway baseline
# from the declarative snapshot, then replay every later migration in CI.
baseline_version="20261010000000"
temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT

shopt -s nullglob
for migration in supabase/migrations/*.sql; do
  filename="$(basename "$migration")"
  if [[ "$filename" > "${baseline_version}_" ]]; then
    cp "$migration" "$temporary_directory/$filename"
  fi
done
rm -f supabase/migrations/*.sql

npx supabase db schema declarative sync -f ci_snapshot_baseline --no-apply
generated_baseline="$(find supabase/migrations -name '*_ci_snapshot_baseline.sql' -print -quit)"
test -n "$generated_baseline"

mv "$generated_baseline" "supabase/migrations/${baseline_version}_ci_snapshot_baseline.sql"
cp "$temporary_directory"/*.sql supabase/migrations/
