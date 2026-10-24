#!/usr/bin/env bash
# Applies supabase/migrations twice to a throwaway Postgres (idempotency) on top of a minimal Supabase stub, then runs
# the two-account RLS test. Needs psql and a server: PGHOST/PGPORT/PGUSER (CI uses a postgres:16 service container).
set -euo pipefail
cd "$(dirname "$0")/.."
db="av_migration_test_$$"
psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "create database $db"
trap 'psql -X -q -d postgres -c "drop database if exists $db" >/dev/null' EXIT
# Roles are cluster-wide: create them only if missing.
psql -X -q -d "$db" -v ON_ERROR_STOP=1 -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if; if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if; end \$\$;"
grep -v '^create role' supabase/tests/supabase_stub.sql | psql -X -q -d "$db" -v ON_ERROR_STOP=1
for pass in 1 2; do
  for f in supabase/migrations/*.sql; do
    PGOPTIONS='-c client_min_messages=warning' psql -X -q -d "$db" -v ON_ERROR_STOP=1 -f "$f" || { echo "Migration $f failed on pass $pass"; exit 1; }
  done
done
psql -X -q -d "$db" -v ON_ERROR_STOP=1 -f supabase/tests/rls.sql
psql -X -q -d "$db" -v ON_ERROR_STOP=1 -f supabase/tests/admin.sql
psql -X -q -d "$db" -v ON_ERROR_STOP=1 -f supabase/tests/sessions.sql
psql -X -q -d "$db" -v ON_ERROR_STOP=1 -f supabase/tests/subscriptions.sql
