-- The item's current price per base unit. Set on the item form, kept up to date by every Stock In and price
-- change, and used to fill in the price on the next Stock In (handy when nothing is in stock).
ALTER TABLE items ADD COLUMN IF NOT EXISTS price numeric(20,6) CHECK (price IS NULL OR price >= 0);
UPDATE items i SET price = coalesce(
  CASE WHEN i.quantity > 0 THEN round(i.stock_value / i.quantity, 6) END,
  (SELECT t.unit_cost FROM stock_transactions t WHERE t.item_id = i.id AND t.txn_type IN ('stock_in','revaluation') ORDER BY t.id DESC LIMIT 1))
 WHERE i.price IS NULL;

INSERT INTO schema_migrations (name) VALUES ('012_item_price.sql') ON CONFLICT DO NOTHING;
