-- ÌṢÚRA serves several businesses from one app. Each business (a "store") has its own private data.
-- Privacy is enforced by the database itself (row-level security): every query runs with the current
-- business set in isura.store_id, and rows of other businesses are invisible to it.
-- The data that already exists becomes business #1 (the ÌṢÚRA owner's own store, never expires).
-- NOTE for later migrations: with FORCE ROW LEVEL SECURITY, a migration that updates business data must
-- first SELECT set_config('isura.store_id', '<id>', true) for each business (or it will see no rows).

CREATE TABLE IF NOT EXISTS stores (
  id               serial PRIMARY KEY,
  name             text NOT NULL CHECK (length(trim(name)) > 0),
  status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  paid_until       timestamptz,                 -- NULL = no end date
  price_kobo       bigint NOT NULL DEFAULT 0 CHECK (price_kobo >= 0),
  interval_months  integer NOT NULL DEFAULT 1 CHECK (interval_months BETWEEN 1 AND 12),
  billing_email    text,
  notes            text,
  reminded_for     timestamptz,                 -- the paid_until we last sent an "ending soon" email for
  created_at       timestamptz NOT NULL DEFAULT now()
);
INSERT INTO stores (id, name) SELECT 1, coalesce((SELECT store_name FROM settings ORDER BY id LIMIT 1), 'ÌṢÚRA')
  ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('stores', 'id'), greatest(1, (SELECT max(id) FROM stores)));

-- Payments for subscriptions (Paystack). A reference is applied once only.
CREATE TABLE IF NOT EXISTS payments (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id     integer NOT NULL REFERENCES stores(id),
  reference    text NOT NULL UNIQUE,
  amount_kobo  bigint NOT NULL,
  months       integer NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  method       text NOT NULL DEFAULT 'paystack',   -- paystack | manual
  paid_at      timestamptz,
  new_paid_until timestamptz,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  raw          jsonb
);
CREATE INDEX IF NOT EXISTS payments_store_idx ON payments (store_id, created_at DESC);

-- Platform-wide settings (one row): Paystack keys, which business is ÌṢÚRA's own (for system emails).
CREATE TABLE IF NOT EXISTS platform_settings (
  id                   smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  paystack_secret_key  text,
  home_store_id        integer REFERENCES stores(id),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id, home_store_id) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;

-- Invitations, used to hand a business to a new owner by email.
CREATE TABLE IF NOT EXISTS store_invites (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id         integer NOT NULL REFERENCES stores(id),
  email            text NOT NULL,
  role             text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'staff', 'viewer')),
  token_hash       text NOT NULL UNIQUE,
  demote_previous  boolean NOT NULL DEFAULT true,
  invited_by       uuid,
  expires_at       timestamptz NOT NULL,
  accepted_at      timestamptz,
  accepted_user    uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION current_store() RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('isura.store_id', true), '')::integer
$$;

-- Users and sessions: a user belongs to one business; the ÌṢÚRA admin can open any business.
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id integer REFERENCES stores(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;
UPDATE users SET store_id = 1 WHERE store_id IS NULL;
UPDATE users SET is_platform_admin = true
 WHERE id = (SELECT id FROM users WHERE role = 'owner' AND deleted_at IS NULL ORDER BY created_at LIMIT 1)
   AND NOT EXISTS (SELECT 1 FROM users WHERE is_platform_admin);
ALTER TABLE users ALTER COLUMN store_id SET DEFAULT current_store();
CREATE INDEX IF NOT EXISTS users_store_idx ON users (store_id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_store_id integer REFERENCES stores(id);

-- Settings: one row per business.
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_id_check;
ALTER TABLE settings ALTER COLUMN id DROP DEFAULT;

-- Every business-owned table gets store_id (filled for existing rows), defaulting to the current business.
ALTER TABLE stock_transactions DISABLE TRIGGER stock_transactions_immutable;
DO $mig$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['settings','categories','suppliers','workers','items','item_unit_conversions','stock_transactions',
                           'stock_counts','audit_logs','generated_reports','email_log'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS store_id integer REFERENCES stores(id)', t);
    EXECUTE format('UPDATE %I SET store_id = 1 WHERE store_id IS NULL', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN store_id SET DEFAULT current_store()', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN store_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (store_id)', t || '_store_idx', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS business_only ON %I', t);
    EXECUTE format('CREATE POLICY business_only ON %I USING (store_id = current_store()) WITH CHECK (store_id = current_store())', t);
  END LOOP;
END $mig$;
ALTER TABLE stock_transactions ENABLE TRIGGER stock_transactions_immutable;

ALTER TABLE units ADD COLUMN IF NOT EXISTS store_id integer REFERENCES stores(id);
UPDATE units SET store_id = 1 WHERE NOT is_system AND store_id IS NULL;

-- Units and conversion rules: standard ones (store_id NULL) are shared and read-only; custom ones are private.
DO $mig$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['units','unit_conversions'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS store_id integer REFERENCES stores(id)', t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN store_id SET DEFAULT current_store()', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS shared_read ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS own_write ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS own_update ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS own_delete ON %I', t);
    EXECUTE format('CREATE POLICY shared_read ON %I FOR SELECT USING (store_id IS NULL OR store_id = current_store())', t);
    EXECUTE format('CREATE POLICY own_write ON %I FOR INSERT WITH CHECK (store_id = current_store())', t);
    EXECUTE format('CREATE POLICY own_update ON %I FOR UPDATE USING (store_id = current_store()) WITH CHECK (store_id = current_store())', t);
    EXECUTE format('CREATE POLICY own_delete ON %I FOR DELETE USING (store_id = current_store())', t);
  END LOOP;
END $mig$;

-- Users: visible within their business (plus the ÌṢÚRA admin, so their name shows on records);
-- everything is visible when no business is selected (sign-in, the ÌṢÚRA admin page).
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_users ON users;
DROP POLICY IF EXISTS users_read ON users;
DROP POLICY IF EXISTS users_insert ON users;
DROP POLICY IF EXISTS users_update ON users;
DROP POLICY IF EXISTS users_delete ON users;
CREATE POLICY users_read ON users FOR SELECT USING (current_store() IS NULL OR store_id = current_store() OR is_platform_admin);
-- Changes only within the business (a business can't edit the ÌṢÚRA admin's account).
CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (current_store() IS NULL OR (store_id = current_store() AND NOT is_platform_admin));
CREATE POLICY users_update ON users FOR UPDATE USING (current_store() IS NULL OR store_id = current_store())
  WITH CHECK (current_store() IS NULL OR store_id = current_store());
CREATE POLICY users_delete ON users FOR DELETE USING (current_store() IS NULL OR store_id = current_store());

-- Names and codes only need to be unique within a business.
DROP INDEX IF EXISTS categories_name_uq;   CREATE UNIQUE INDEX categories_name_uq ON categories (store_id, lower(name));
DROP INDEX IF EXISTS suppliers_name_uq;    CREATE UNIQUE INDEX suppliers_name_uq ON suppliers (store_id, lower(name));
DROP INDEX IF EXISTS workers_name_uq;      CREATE UNIQUE INDEX workers_name_uq ON workers (store_id, lower(name));
DROP INDEX IF EXISTS items_sku_uq;         CREATE UNIQUE INDEX items_sku_uq ON items (store_id, lower(sku));
DROP INDEX IF EXISTS units_name_uq;        CREATE UNIQUE INDEX units_name_uq ON units (coalesce(store_id, 0), lower(name));
DROP INDEX IF EXISTS units_symbol_uq;      CREATE UNIQUE INDEX units_symbol_uq ON units (coalesce(store_id, 0), lower(symbol));
ALTER TABLE unit_conversions DROP CONSTRAINT IF EXISTS unit_conversions_from_unit_id_to_unit_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS unit_conversions_pair_uq ON unit_conversions (coalesce(store_id, 0), from_unit_id, to_unit_id);
DROP INDEX IF EXISTS generated_reports_sched_uq;
CREATE UNIQUE INDEX generated_reports_sched_uq ON generated_reports (store_id, period_type, period_start, format)
  WHERE trigger = 'scheduled' AND status = 'success';
CREATE UNIQUE INDEX IF NOT EXISTS settings_store_uq ON settings (store_id);

INSERT INTO schema_migrations (name) VALUES ('016_businesses.sql') ON CONFLICT DO NOTHING;
