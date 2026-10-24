-- ÌṢÚRA rebrand: new default name (only if the store still has an earlier default name).
UPDATE settings SET store_name = 'ÌṢÚRA' WHERE store_name IN ('The Velvet Store', 'MY STORE', 'My Store');
ALTER TABLE settings ALTER COLUMN store_name SET DEFAULT 'ÌṢÚRA';

-- Optional photo per item for the product cards (resized in the browser before upload, so small).
ALTER TABLE items ADD COLUMN IF NOT EXISTS photo bytea;
ALTER TABLE items ADD COLUMN IF NOT EXISTS photo_type text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS photo_updated_at timestamptz;

INSERT INTO schema_migrations (name) VALUES ('015_isura.sql') ON CONFLICT DO NOTHING;
