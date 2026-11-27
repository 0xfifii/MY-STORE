-- The product is now Palm Store: a business still called by an old product name (ÌṢÚRA, The Velvet Store, MY STORE)
-- is renamed, so reports, receipts and the app header say Palm Store. Businesses with their own names are untouched.
UPDATE settings SET store_name = 'Palm Store' WHERE store_name IN ('ÌṢÚRA', 'ISURA', 'Isura', 'The Velvet Store', 'MY STORE', 'My Store');
ALTER TABLE settings ALTER COLUMN store_name SET DEFAULT 'Palm Store';
UPDATE stores SET name = 'Palm Store' WHERE name IN ('ÌṢÚRA', 'ISURA', 'Isura', 'The Velvet Store', 'MY STORE', 'My Store');

INSERT INTO schema_migrations (name) VALUES ('024_palm_store_name.sql') ON CONFLICT DO NOTHING;
