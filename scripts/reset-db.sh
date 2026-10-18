#!/usr/bin/env bash
# Drops and recreates a LOCAL database, then runs migrations. Never point this at production.
set -euo pipefail
DB_NAME="${1:?usage: scripts/reset-db.sh <database-name>}"
PGHOST="${PGHOST:-127.0.0.1}" PGUSER="${PGUSER:-postgres}"
psql -h "$PGHOST" -U "$PGUSER" -d postgres -qc "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE)" -c "CREATE DATABASE \"$DB_NAME\""
DATABASE_URL="postgres://$PGUSER@$PGHOST:5432/$DB_NAME" node scripts/migrate.mjs
