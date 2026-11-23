-- Self sign-up: anyone can create an account for their company, which becomes its own business
-- with a free trial. The ÌṢÚRA admin can turn sign-ups off and set the trial length and price.
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allow_signup boolean NOT NULL DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS signup_trial_days integer NOT NULL DEFAULT 14 CHECK (signup_trial_days BETWEEN 0 AND 365);
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS signup_price_kobo bigint NOT NULL DEFAULT 0 CHECK (signup_price_kobo >= 0);
ALTER TABLE stores ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'admin' CHECK (created_via IN ('admin', 'signup', 'setup'));

INSERT INTO schema_migrations (name) VALUES ('019_signup.sql') ON CONFLICT DO NOTHING;
