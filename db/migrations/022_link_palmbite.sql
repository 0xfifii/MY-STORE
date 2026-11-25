-- One-time setup asked for by the owner: link the ÌṢÚRA home business (Palmspring) with the Palmbite account.
--  * store_links: the two businesses can transfer stock to each other.
--  * user_links: the ÌṢÚRA admin's sign-in and the Palmbite sign-in can switch to each other without signing out.
-- Does nothing if the Palmbite account doesn't exist (fresh or test databases). Both can be changed later in the app.
INSERT INTO store_links (store_a, store_b)
SELECT least(h.home_store_id, u.store_id), greatest(h.home_store_id, u.store_id)
  FROM platform_settings h
  JOIN users u ON lower(u.email) = 'alasoluyiodunayo1204@gmail.com' AND u.deleted_at IS NULL
 WHERE h.id = 1 AND h.home_store_id IS NOT NULL AND u.store_id IS NOT NULL AND u.store_id <> h.home_store_id
ON CONFLICT DO NOTHING;

INSERT INTO user_links (user_a, user_b)
SELECT least(a.id, b.id), greatest(a.id, b.id)
  FROM users a
  JOIN users b ON lower(b.email) = 'alasoluyiodunayo1204@gmail.com' AND b.deleted_at IS NULL AND b.id <> a.id
 WHERE a.is_platform_admin AND a.deleted_at IS NULL
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations (name) VALUES ('022_link_palmbite.sql') ON CONFLICT DO NOTHING;
