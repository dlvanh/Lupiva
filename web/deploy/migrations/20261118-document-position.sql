-- 2026-11-18: uploaded images keep their submitted order.
ALTER TABLE uploaded_documents ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;