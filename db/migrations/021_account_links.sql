-- Linked accounts: one person with sign-ins in different businesses (e.g. Palmspring and Palmbite)
-- links them once, with the other account's email and password, and can then switch between them
-- without signing out. Each account keeps its own business, data and role; nothing is shared but the
-- shortcut. Links are joined into groups: linking A–B and B–C lets any of the three switch to the others.

CREATE TABLE IF NOT EXISTS user_links (
  user_a      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX IF NOT EXISTS user_links_b_idx ON user_links (user_b);

INSERT INTO schema_migrations (name) VALUES ('021_account_links.sql') ON CONFLICT DO NOTHING;
