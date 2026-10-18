-- MY STORE — initial schema
-- All stock movements go through the stock_in / stock_out / reverse_transaction
-- functions below. They lock the item row (SELECT ... FOR UPDATE), validate on
-- the server, and write the item balance + the transaction record in one
-- database transaction, so concurrent requests cannot produce wrong balances.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  id                   smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  store_name           text        NOT NULL DEFAULT 'MY STORE',
  currency_code        text        NOT NULL DEFAULT 'NGN',
  currency_symbol      text        NOT NULL DEFAULT '₦',
  timezone             text        NOT NULL DEFAULT 'Africa/Lagos',
  costing_method       text        NOT NULL DEFAULT 'weighted_average'
                                   CHECK (costing_method IN ('weighted_average')),
  auto_report_enabled  boolean     NOT NULL DEFAULT false,
  auto_report_time     time        NOT NULL DEFAULT '07:00',
  auto_report_covers   text        NOT NULL DEFAULT 'previous_day'
                                   CHECK (auto_report_covers IN ('previous_day','same_day')),
  auto_report_formats  text[]      NOT NULL DEFAULT ARRAY['pdf','xlsx'],
  email_enabled        boolean     NOT NULL DEFAULT false,
  email_recipients     text[]      NOT NULL DEFAULT ARRAY[]::text[],
  updated_at           timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings (id) VALUES (1);

-- ---------------------------------------------------------------------------
-- Users, sessions, login throttling
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (length(trim(name)) > 0),
  email          text NOT NULL,
  password_hash  text NOT NULL,
  role           text NOT NULL CHECK (role IN ('owner','staff','viewer')),
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));

CREATE TABLE sessions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token_hash  text NOT NULL UNIQUE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE login_attempts (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         text NOT NULL,
  success       boolean NOT NULL,
  attempted_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email_idx ON login_attempts (lower(email), attempted_at DESC);

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
CREATE TABLE units (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           text NOT NULL CHECK (length(trim(name)) > 0),
  symbol         text NOT NULL CHECK (length(trim(symbol)) > 0),
  allow_decimal  boolean NOT NULL DEFAULT true,
  is_system      boolean NOT NULL DEFAULT false,
  archived_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX units_symbol_uq ON units (lower(symbol));
CREATE UNIQUE INDEX units_name_uq ON units (lower(name));

-- Global conversion rule: 1 from_unit = factor × to_unit (e.g. 1 kg = 1000 g).
-- Only used when the item's base unit is one side of the rule.
CREATE TABLE unit_conversions (
  id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_unit_id  integer NOT NULL REFERENCES units(id),
  to_unit_id    integer NOT NULL REFERENCES units(id),
  factor        numeric NOT NULL CHECK (factor > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (from_unit_id <> to_unit_id),
  UNIQUE (from_unit_id, to_unit_id)
);

CREATE TABLE categories (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         text NOT NULL CHECK (length(trim(name)) > 0),
  description  text,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_name_uq ON categories (lower(name));

CREATE TABLE suppliers (
  id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            text NOT NULL CHECK (length(trim(name)) > 0),
  contact_person  text,
  phone           text,
  email           text,
  address         text,
  notes           text,
  archived_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX suppliers_name_uq ON suppliers (lower(name));

-- ---------------------------------------------------------------------------
-- Items
-- quantity / stock_value are maintained ONLY by the stock functions below.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE item_sku_seq START 1;

CREATE TABLE items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                  text NOT NULL CHECK (length(trim(sku)) > 0),
  name                 text NOT NULL CHECK (length(trim(name)) > 0),
  category_id          integer REFERENCES categories(id),
  description          text,
  unit_id              integer NOT NULL REFERENCES units(id),
  allow_fraction       boolean NOT NULL DEFAULT true,
  quantity             numeric(20,6) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  stock_value          numeric(20,4) NOT NULL DEFAULT 0 CHECK (stock_value >= 0),
  min_stock_level      numeric(20,6) NOT NULL DEFAULT 0 CHECK (min_stock_level >= 0),
  default_supplier_id  integer REFERENCES suppliers(id),
  notes                text,
  archived_at          timestamptz,
  created_by           uuid REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (quantity > 0 OR stock_value = 0)
);
CREATE UNIQUE INDEX items_sku_uq ON items (lower(sku));
CREATE INDEX items_name_trgm ON items USING gin (lower(name) gin_trgm_ops);
CREATE INDEX items_sku_trgm ON items USING gin (lower(sku) gin_trgm_ops);
CREATE INDEX items_category_idx ON items (category_id);

-- Item-specific conversion: 1 unit_id = factor × item base unit
-- (e.g. for "Rice": 1 bag = 50 kg; for "Coke": 1 crate = 24 bottles).
CREATE TABLE item_unit_conversions (
  id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id   uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  unit_id   integer NOT NULL REFERENCES units(id),
  factor    numeric NOT NULL CHECK (factor > 0),
  UNIQUE (item_id, unit_id)
);

-- ---------------------------------------------------------------------------
-- Stock transactions (append-only ledger)
-- ---------------------------------------------------------------------------
CREATE TABLE stock_transactions (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  txn_no             text GENERATED ALWAYS AS ('TXN-' || lpad(id::text, 6, '0')) STORED,
  item_id            uuid NOT NULL REFERENCES items(id),
  txn_type           text NOT NULL CHECK (txn_type IN ('stock_in','stock_out','reversal')),
  direction          smallint NOT NULL CHECK (direction IN (1,-1)),
  is_opening         boolean NOT NULL DEFAULT false,
  -- what the user typed
  entered_quantity   numeric(20,6) NOT NULL CHECK (entered_quantity > 0),
  entered_unit_id    integer NOT NULL REFERENCES units(id),
  conversion_factor  numeric NOT NULL CHECK (conversion_factor > 0),
  entered_unit_cost  numeric(20,6) NOT NULL CHECK (entered_unit_cost >= 0),
  -- normalised to the item's base unit
  quantity           numeric(20,6) NOT NULL CHECK (quantity > 0),
  unit_id            integer NOT NULL REFERENCES units(id),
  unit_cost          numeric(20,6) NOT NULL CHECK (unit_cost >= 0),
  total_value        numeric(20,4) NOT NULL CHECK (total_value >= 0),
  -- running balance after this movement (in order of recording)
  balance_after      numeric(20,6) NOT NULL CHECK (balance_after >= 0),
  value_after        numeric(20,4) NOT NULL CHECK (value_after >= 0),
  reason             text CHECK (reason IN ('store_usage','kitchen_usage','sale','transfer','damage','expiry','wastage','other')),
  supplier_id        integer REFERENCES suppliers(id),
  supplier_name      text,
  recipient          text,
  reference          text,
  notes              text,
  reverses_id        bigint UNIQUE REFERENCES stock_transactions(id),
  correction_reason  text,
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES users(id),
  client_request_id  uuid UNIQUE,
  CHECK (txn_type <> 'stock_in'  OR direction = 1),
  CHECK (txn_type <> 'stock_out' OR (direction = -1 AND reason IS NOT NULL)),
  CHECK (txn_type <> 'reversal'  OR (reverses_id IS NOT NULL AND correction_reason IS NOT NULL))
);
CREATE INDEX stock_txn_item_idx ON stock_transactions (item_id, occurred_at);
CREATE INDEX stock_txn_occurred_idx ON stock_transactions (occurred_at);
CREATE INDEX stock_txn_type_idx ON stock_transactions (txn_type, occurred_at);

-- Ledger rows can never be edited or deleted (corrections use reversals).
CREATE FUNCTION forbid_ledger_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LEDGER_IMMUTABLE: stock transactions cannot be modified or deleted; use a reversal';
END $$;
CREATE TRIGGER stock_transactions_immutable
  BEFORE UPDATE OR DELETE ON stock_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_change();

-- ---------------------------------------------------------------------------
-- Audit log & generated reports
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid REFERENCES users(id),
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    text,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

CREATE TABLE generated_reports (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title            text NOT NULL,
  report_kind      text NOT NULL,
  period_start     date NOT NULL,
  period_end       date NOT NULL,
  filters          jsonb NOT NULL DEFAULT '{}'::jsonb,
  format           text NOT NULL CHECK (format IN ('pdf','xlsx','csv')),
  file_name        text,
  content          bytea,
  size_bytes       integer,
  status           text NOT NULL CHECK (status IN ('success','failed')),
  error            text,
  trigger          text NOT NULL CHECK (trigger IN ('manual','scheduled')),
  delivery_status  text NOT NULL DEFAULT 'not_configured',
  delivery_detail  text,
  generated_by     uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generated_reports_created_idx ON generated_reports (created_at DESC);
-- At most one successful scheduled report per day per format.
CREATE UNIQUE INDEX generated_reports_sched_uq
  ON generated_reports (period_start, format)
  WHERE trigger = 'scheduled' AND status = 'success';

-- ---------------------------------------------------------------------------
-- Unit conversion resolution
-- Returns how many base units one p_unit_id is worth for this item.
-- ---------------------------------------------------------------------------
CREATE FUNCTION resolve_unit_factor(p_item_id uuid, p_unit_id integer)
RETURNS numeric LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_base integer;
  v_factor numeric;
BEGIN
  SELECT unit_id INTO v_base FROM items WHERE id = p_item_id;
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND';
  END IF;
  IF p_unit_id = v_base THEN
    RETURN 1;
  END IF;
  SELECT factor INTO v_factor FROM item_unit_conversions
   WHERE item_id = p_item_id AND unit_id = p_unit_id;
  IF v_factor IS NOT NULL THEN RETURN v_factor; END IF;
  SELECT factor INTO v_factor FROM unit_conversions
   WHERE from_unit_id = p_unit_id AND to_unit_id = v_base;
  IF v_factor IS NOT NULL THEN RETURN v_factor; END IF;
  SELECT 1 / factor INTO v_factor FROM unit_conversions
   WHERE from_unit_id = v_base AND to_unit_id = p_unit_id;
  IF v_factor IS NOT NULL THEN RETURN v_factor; END IF;
  RAISE EXCEPTION 'UNIT_NOT_CONVERTIBLE: no conversion rule from this unit to the item''s unit';
END $$;

-- Shared validation of quantity against fraction rules.
CREATE FUNCTION check_quantity(p_item items, p_entered numeric, p_entered_unit integer, p_base_qty numeric)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_unit_decimal boolean;
BEGIN
  IF p_entered IS NULL OR p_entered <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: quantity must be greater than zero';
  END IF;
  IF p_base_qty <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: quantity is too small to record';
  END IF;
  SELECT allow_decimal INTO v_unit_decimal FROM units WHERE id = p_entered_unit;
  IF (NOT v_unit_decimal) AND p_entered <> trunc(p_entered) THEN
    RAISE EXCEPTION 'FRACTION_NOT_ALLOWED: this unit only accepts whole numbers';
  END IF;
  IF (NOT p_item.allow_fraction) AND p_base_qty <> trunc(p_base_qty) THEN
    RAISE EXCEPTION 'FRACTION_NOT_ALLOWED: this item only accepts whole quantities';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- STOCK IN
-- ---------------------------------------------------------------------------
CREATE FUNCTION stock_in(
  p_item_id        uuid,
  p_quantity       numeric,
  p_unit_id        integer,
  p_unit_cost      numeric,       -- cost per ENTERED unit
  p_supplier_id    integer,
  p_supplier_name  text,
  p_reference      text,
  p_notes          text,
  p_occurred_at    timestamptz,
  p_user_id        uuid,
  p_request_id     uuid,
  p_is_opening     boolean DEFAULT false
) RETURNS stock_transactions LANGUAGE plpgsql AS $$
DECLARE
  v_item    items;
  v_factor  numeric;
  v_base    numeric(20,6);
  v_value   numeric(20,4);
  v_txn     stock_transactions;
BEGIN
  SELECT * INTO v_item FROM items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;

  -- Idempotency: a retried/double-clicked submission returns the original row.
  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_txn FROM stock_transactions WHERE client_request_id = p_request_id;
    IF FOUND THEN RETURN v_txn; END IF;
  END IF;

  IF v_item.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'ITEM_ARCHIVED: this item is archived';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'INVALID_COST: cost per unit cannot be negative';
  END IF;
  IF p_occurred_at IS NOT NULL AND p_occurred_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'INVALID_DATE: receipt date cannot be in the future';
  END IF;

  v_factor := resolve_unit_factor(p_item_id, p_unit_id);
  v_base   := round(p_quantity * v_factor, 6);
  PERFORM check_quantity(v_item, p_quantity, p_unit_id, v_base);
  v_value  := round(p_quantity * p_unit_cost, 2);   -- money is kept to the kobo so every total reconciles exactly

  UPDATE items
     SET quantity = quantity + v_base,
         stock_value = stock_value + v_value,
         updated_at = now()
   WHERE id = p_item_id
  RETURNING * INTO v_item;

  INSERT INTO stock_transactions (
    item_id, txn_type, direction, is_opening,
    entered_quantity, entered_unit_id, conversion_factor, entered_unit_cost,
    quantity, unit_id, unit_cost, total_value,
    balance_after, value_after,
    supplier_id, supplier_name, reference, notes,
    occurred_at, created_by, client_request_id
  ) VALUES (
    p_item_id, 'stock_in', 1, coalesce(p_is_opening, false),
    p_quantity, p_unit_id, v_factor, p_unit_cost,
    v_base, v_item.unit_id, round(p_unit_cost / v_factor, 6), v_value,
    v_item.quantity, v_item.stock_value,
    p_supplier_id, nullif(trim(p_supplier_name), ''), nullif(trim(p_reference), ''), nullif(trim(p_notes), ''),
    coalesce(p_occurred_at, now()), p_user_id, p_request_id
  ) RETURNING * INTO v_txn;

  RETURN v_txn;
END $$;

-- ---------------------------------------------------------------------------
-- STOCK OUT (perpetual weighted-average cost)
-- ---------------------------------------------------------------------------
CREATE FUNCTION stock_out(
  p_item_id     uuid,
  p_quantity    numeric,
  p_unit_id     integer,
  p_reason      text,
  p_recipient   text,
  p_reference   text,
  p_notes       text,
  p_user_id     uuid,
  p_request_id  uuid
) RETURNS stock_transactions LANGUAGE plpgsql AS $$
DECLARE
  v_item     items;
  v_factor   numeric;
  v_base     numeric(20,6);
  v_avg      numeric(20,6);
  v_value    numeric(20,4);
  v_txn      stock_transactions;
BEGIN
  SELECT * INTO v_item FROM items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ITEM_NOT_FOUND'; END IF;

  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_txn FROM stock_transactions WHERE client_request_id = p_request_id;
    IF FOUND THEN RETURN v_txn; END IF;
  END IF;

  IF v_item.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'ITEM_ARCHIVED: this item is archived';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('store_usage','kitchen_usage','sale','transfer','damage','expiry','wastage','other') THEN
    RAISE EXCEPTION 'INVALID_REASON: choose a reason for removing stock';
  END IF;
  IF p_reason = 'other' AND coalesce(trim(p_notes), '') = '' THEN
    RAISE EXCEPTION 'NOTE_REQUIRED: add a note explaining the "Other" reason';
  END IF;

  v_factor := resolve_unit_factor(p_item_id, p_unit_id);
  v_base   := round(p_quantity * v_factor, 6);
  PERFORM check_quantity(v_item, p_quantity, p_unit_id, v_base);

  IF v_base > v_item.quantity THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: only % available', trim_scale(v_item.quantity)
      USING DETAIL = trim_scale(v_item.quantity)::text;
  END IF;

  v_avg := CASE WHEN v_item.quantity > 0 THEN round(v_item.stock_value / v_item.quantity, 6) ELSE 0 END;
  IF v_base = v_item.quantity THEN
    v_value := v_item.stock_value;            -- issuing everything clears the value exactly
  ELSE
    v_value := round(v_item.stock_value * v_base / v_item.quantity, 2);
  END IF;

  UPDATE items
     SET quantity = quantity - v_base,
         stock_value = stock_value - v_value,
         updated_at = now()
   WHERE id = p_item_id
  RETURNING * INTO v_item;

  INSERT INTO stock_transactions (
    item_id, txn_type, direction,
    entered_quantity, entered_unit_id, conversion_factor, entered_unit_cost,
    quantity, unit_id, unit_cost, total_value,
    balance_after, value_after,
    reason, recipient, reference, notes,
    occurred_at, created_by, client_request_id
  ) VALUES (
    p_item_id, 'stock_out', -1,
    p_quantity, p_unit_id, v_factor, round(v_avg * v_factor, 6),
    v_base, v_item.unit_id, v_avg, v_value,
    v_item.quantity, v_item.stock_value,
    p_reason, nullif(trim(p_recipient), ''), nullif(trim(p_reference), ''), nullif(trim(p_notes), ''),
    now(), p_user_id, p_request_id
  ) RETURNING * INTO v_txn;

  RETURN v_txn;
END $$;

-- ---------------------------------------------------------------------------
-- REVERSAL (controlled correction)
-- ---------------------------------------------------------------------------
CREATE FUNCTION reverse_transaction(
  p_txn_id      bigint,
  p_reason      text,
  p_user_id     uuid,
  p_request_id  uuid
) RETURNS stock_transactions LANGUAGE plpgsql AS $$
DECLARE
  v_orig   stock_transactions;
  v_item   items;
  v_value  numeric(20,4);
  v_txn    stock_transactions;
  v_dir    smallint;
BEGIN
  SELECT * INTO v_orig FROM stock_transactions WHERE id = p_txn_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TXN_NOT_FOUND'; END IF;

  SELECT * INTO v_item FROM items WHERE id = v_orig.item_id FOR UPDATE;

  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_txn FROM stock_transactions WHERE client_request_id = p_request_id;
    IF FOUND THEN RETURN v_txn; END IF;
  END IF;

  IF v_orig.txn_type = 'reversal' THEN
    RAISE EXCEPTION 'CANNOT_REVERSE: a reversal cannot itself be reversed';
  END IF;
  IF EXISTS (SELECT 1 FROM stock_transactions WHERE reverses_id = p_txn_id) THEN
    RAISE EXCEPTION 'ALREADY_REVERSED: this transaction has already been reversed';
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: give a reason for the correction';
  END IF;

  v_dir := -v_orig.direction;

  IF v_dir = -1 THEN
    -- Undoing a receipt: the received quantity must still be in stock.
    IF v_orig.quantity > v_item.quantity THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: only % available; part of this receipt has already been issued', trim_scale(v_item.quantity)
        USING DETAIL = trim_scale(v_item.quantity)::text;
    END IF;
    IF v_orig.quantity = v_item.quantity THEN
      v_value := v_item.stock_value;
    ELSE
      v_value := least(v_orig.total_value, v_item.stock_value);
    END IF;
  ELSE
    -- Undoing an issue: put it back at the cost it left with.
    v_value := v_orig.total_value;
  END IF;

  UPDATE items
     SET quantity = quantity + v_dir * v_orig.quantity,
         stock_value = stock_value + v_dir * v_value,
         updated_at = now()
   WHERE id = v_orig.item_id
  RETURNING * INTO v_item;

  INSERT INTO stock_transactions (
    item_id, txn_type, direction,
    entered_quantity, entered_unit_id, conversion_factor, entered_unit_cost,
    quantity, unit_id, unit_cost, total_value,
    balance_after, value_after,
    reverses_id, correction_reason, reference,
    occurred_at, created_by, client_request_id
  ) VALUES (
    v_orig.item_id, 'reversal', v_dir,
    v_orig.entered_quantity, v_orig.entered_unit_id, v_orig.conversion_factor, v_orig.entered_unit_cost,
    v_orig.quantity, v_orig.unit_id, round(v_value / v_orig.quantity, 6), v_value,
    v_item.quantity, v_item.stock_value,
    v_orig.id, trim(p_reason), v_orig.txn_no,
    now(), p_user_id, p_request_id
  ) RETURNING * INTO v_txn;

  RETURN v_txn;
END $$;

-- ---------------------------------------------------------------------------
-- Migration bookkeeping
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- Record this migration (lets it be pasted into an SQL editor by hand too).
CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations (name) VALUES ('001_init.sql') ON CONFLICT DO NOTHING;
