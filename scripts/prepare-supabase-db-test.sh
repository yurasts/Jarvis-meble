#!/usr/bin/env bash
set -euo pipefail

# The remote history predates the repository baseline. Build a throwaway baseline
# from the declarative snapshot, then replay the security migration in CI.
security_migration="supabase/migrations/20261010182230_harden_project_file_access.sql"
temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT

cp "$security_migration" "$temporary_directory/security.sql"
rm -f supabase/migrations/*.sql

npx supabase db schema declarative sync -f ci_snapshot_baseline --no-apply
generated_baseline="$(find supabase/migrations -name '*_ci_snapshot_baseline.sql' -print -quit)"
test -n "$generated_baseline"

mv "$generated_baseline" supabase/migrations/20261010000000_ci_snapshot_baseline.sql
cp "$temporary_directory/security.sql" "$security_migration"
