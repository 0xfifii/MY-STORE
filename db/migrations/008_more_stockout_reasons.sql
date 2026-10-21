-- New stock-out reasons: bakery usage, bar usage, cleaning usage.
ALTER TABLE stock_transactions DROP CONSTRAINT IF EXISTS stock_transactions_reason_check;
ALTER TABLE stock_transactions ADD CONSTRAINT stock_transactions_reason_check
  CHECK (reason IN ('store_usage','kitchen_usage','bakery_usage','bar_usage','cleaning_usage','sale','transfer','damage','expiry','wastage','other'));

-- Teach stock_out() the same list (patched in place so the rest of the function is unchanged).
DO $mig$
DECLARE r record; d text;
BEGIN
  FOR r IN SELECT oid FROM pg_proc WHERE proname = 'stock_out' AND prosrc LIKE '%''kitchen_usage'',''sale''%' LOOP
    d := pg_get_functiondef(r.oid);
    d := replace(d, '''kitchen_usage'',''sale''', '''kitchen_usage'',''bakery_usage'',''bar_usage'',''cleaning_usage'',''sale''');
    EXECUTE d;
  END LOOP;
END $mig$;

INSERT INTO schema_migrations (name) VALUES ('008_more_stockout_reasons.sql') ON CONFLICT DO NOTHING;
