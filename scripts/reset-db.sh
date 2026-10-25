#!/usr/bin/env bash
# Drops and recreates a LOCAL database, then runs migrations. Never point this at production.
# The app connects as an ordinary role (isura_app), like on Neon, so row-level security is really enforced
# (a superuser would skip it).
set -euo pipefail
DB_NAME="${1:?usage: scripts/reset-db.sh <database-name>}"
PGHOST="${PGHOST:-127.0.0.1}" PGUSER="${PGUSER:-postgres}"
APP_ROLE="${APP_ROLE:-isura_app}"
psql -h "$PGHOST" -U "$PGUSER" -d postgres -qc "DO \$\$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$APP_ROLE') THEN CREATE ROLE $APP_ROLE LOGIN PASSWORD 'isura' NOSUPERUSER NOBYPASSRLS; END IF; END\$\$"
psql -h "$PGHOST" -U "$PGUSER" -d postgres -qc "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)" -c "CREATE DATABASE \"$DB_NAME\" OWNER $APP_ROLE"
psql -h "$PGHOST" -U "$PGUSER" -d "$DB_NAME" -qc "ALTER SCHEMA public OWNER TO $APP_ROLE"
DATABASE_URL="postgres://$APP_ROLE:isura@$PGHOST:5432/$DB_NAME" node scripts/migrate.mjs
