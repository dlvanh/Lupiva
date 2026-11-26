-- 2026-11-26: Study IDs become SLER-001, SLER-002, … (src/lib/submissionsService.ts nextStudyId).
-- Existing profiles are renumbered by scripts/renumber-study-ids.ts, which then moves the
-- sequence past the highest number it assigned.
CREATE SEQUENCE IF NOT EXISTS study_id_seq START WITH 1 MINVALUE 1;
