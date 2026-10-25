#!/usr/bin/env bash
# Full acceptance run against a throwaway LOCAL database:
#   1. recreate the test database and migrate it
#   2. start a local SMTP sink (to verify real email delivery)
#   3. start the production build on port 3100
#   4. run the vitest acceptance suite
# Requires: a local PostgreSQL (postgres user, trust auth) and `npm run build` done first.
set -euo pipefail
cd "$(dirname "$0")/.."

TEST_DB="${TEST_DB:-mystore_test}"
PORT="${TEST_PORT:-3100}"
WORK="$(mktemp -d)"
export TEST_DATABASE_URL="postgres://postgres@127.0.0.1:5432/$TEST_DB"
export TEST_BASE_URL="http://localhost:$PORT"
export TEST_CRON_SECRET="test-cron-secret-1234567890"
export TEST_MAIL_DIR="$WORK/mail"
export TEST_BREVO_DIR="$WORK/brevo"

# Kill the whole process group so the Next.js child server doesn't outlive the run.
cleanup() { [ -n "${APP_PID:-}" ] && kill -- -"$APP_PID" 2>/dev/null; kill "${APP_PID:-}" "${SMTP_PID:-}" "${BREVO_PID:-}" "${PAYSTACK_PID:-}" 2>/dev/null || true; }
trap cleanup EXIT

./scripts/reset-db.sh "$TEST_DB"
node tests/smtp-sink.mjs 2526 "$TEST_MAIL_DIR" > "$WORK/smtp.log" 2>&1 & SMTP_PID=$!
node tests/brevo-mock.mjs 2527 "$TEST_BREVO_DIR" > "$WORK/brevo.log" 2>&1 & BREVO_PID=$!
node tests/paystack-mock.mjs 2528 > "$WORK/paystack.log" 2>&1 & PAYSTACK_PID=$!

BREVO_API_URL="http://127.0.0.1:2527/v3" PAYSTACK_API_URL="http://127.0.0.1:2528" DISABLE_INTERNAL_SCHEDULER=true DATABASE_URL="postgres://isura_app:isura@127.0.0.1:5432/$TEST_DB" APP_URL="$TEST_BASE_URL" CRON_SECRET="$TEST_CRON_SECRET" \
SMTP_HOST=127.0.0.1 SMTP_PORT=2526 SMTP_SECURE=false SMTP_FROM="MY STORE <reports@mystore.test>" \
  setsid npx next start -p "$PORT" > "$WORK/server.log" 2>&1 & APP_PID=$!
sleep 0.5
if curl -sf "$TEST_BASE_URL/api/health" >/dev/null 2>&1 && ! kill -0 "$APP_PID" 2>/dev/null; then
  echo "Port $PORT is already in use by another server — stop it first." >&2; exit 1
fi

for _ in $(seq 1 40); do curl -sf "$TEST_BASE_URL/api/health" >/dev/null && break; sleep 0.5; done
npx vitest run "$@"
echo "Server log: $WORK/server.log"
