-- 2026-11-18: "Hồ sơ mới" = never opened by a specialist.
ALTER TABLE crf_submissions ADD COLUMN IF NOT EXISTS first_opened_at timestamptz;
ALTER TABLE crf_submissions ADD COLUMN IF NOT EXISTS first_opened_by_user_id uuid
  REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS crf_submissions_first_opened_idx ON crf_submissions (first_opened_at);
