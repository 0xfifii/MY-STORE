-- Workers who take items from the store (names only — they don't sign in).
CREATE TABLE IF NOT EXISTS workers (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         text NOT NULL CHECK (length(trim(name)) > 0),
  department   text,
  phone        text,
  notes        text,
  archived_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS workers_name_uq ON workers (lower(name));

-- Which worker took the stock (stock out only).
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS worker_id integer REFERENCES workers(id);
CREATE INDEX IF NOT EXISTS stock_txn_worker_idx ON stock_transactions (worker_id, occurred_at);

-- The ledger is append-only, so the worker is attached while the row is inserted: the app sets
-- mystore.worker_id for the current transaction and this trigger copies it onto the new row.
CREATE OR REPLACE FUNCTION attach_worker() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v text := current_setting('mystore.worker_id', true);
BEGIN
  IF NEW.worker_id IS NULL AND NEW.txn_type = 'stock_out' AND coalesce(v, '') <> '' THEN
    NEW.worker_id := v::integer;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stock_transactions_attach_worker ON stock_transactions;
CREATE TRIGGER stock_transactions_attach_worker
  BEFORE INSERT ON stock_transactions
  FOR EACH ROW EXECUTE FUNCTION attach_worker();

-- Per-user permissions chosen by the owner (NULL = role defaults) and the categories a user may
-- stock in / out (NULL = all categories).
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions text[];
ALTER TABLE users ADD COLUMN IF NOT EXISTS allowed_category_ids integer[];

CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
INSERT INTO schema_migrations (name) VALUES ('004_workers_permissions.sql') ON CONFLICT DO NOTHING;
