-- 2026-11-19: Phone + OTP patient registration (email optional) and phone/email login.
ALTER TABLE users ALTER COLUMN email_encrypted DROP NOT NULL;
ALTER TABLE users ALTER COLUMN email_blind_index DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_encrypted text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_blind_index text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_blind_index_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_phone_blind_index_unique UNIQUE (phone_blind_index);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS phone_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_blind_index text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS phone_otps_phone_created_idx ON phone_otps (phone_blind_index, created_at);
CREATE INDEX IF NOT EXISTS phone_otps_expires_at_idx ON phone_otps (expires_at);
