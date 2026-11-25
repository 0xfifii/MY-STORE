-- Transfers between accounts (businesses): stock leaves one business and arrives in another in one step.
-- The sending side records a stock out (reason "Transfer"), the receiving side a stock in at the same cost.
-- The ÌṢÚRA admin can transfer between any businesses; for everyone else the admin links two businesses first.

CREATE TABLE IF NOT EXISTS store_links (
  store_a     integer NOT NULL REFERENCES stores(id),
  store_b     integer NOT NULL REFERENCES stores(id),
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_a, store_b),
  CHECK (store_a < store_b)
);

-- One row per transfer, visible to both businesses (and nobody else).
CREATE TABLE IF NOT EXISTS stock_transfers (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transfer_no      text GENERATED ALWAYS AS ('TRF-' || lpad(id::text, 5, '0')) STORED,
  from_store       integer NOT NULL REFERENCES stores(id),
  to_store         integer NOT NULL REFERENCES stores(id),
  from_name        text NOT NULL,
  to_name          text NOT NULL,
  created_by       uuid,
  created_by_name  text,
  notes            text,
  -- [{from_item_id, to_item_id, name, quantity, unit_symbol, unit_cost, total_value, out_txn, in_txn, created, archived}]
  lines            jsonb NOT NULL DEFAULT '[]',
  request_id       uuid UNIQUE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (from_store <> to_store)
);
CREATE INDEX IF NOT EXISTS stock_transfers_from_idx ON stock_transfers (from_store, created_at DESC);
CREATE INDEX IF NOT EXISTS stock_transfers_to_idx ON stock_transfers (to_store, created_at DESC);
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS either_side ON stock_transfers;
CREATE POLICY either_side ON stock_transfers
  USING (from_store = current_store() OR to_store = current_store())
  WITH CHECK (from_store = current_store() OR to_store = current_store());

INSERT INTO schema_migrations (name) VALUES ('020_transfers.sql') ON CONFLICT DO NOTHING;
