# Phone Capture, Image Order, Page Warp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patients can take photos from the upload page; images keep their submitted order end to end; in the direct-LLM prototype the backend flattens the detected document page with OpenCV before sending/displaying it.

**Architecture:** Web (Next.js, `web/`) gains a native-camera input and an explicit `position` column on `uploaded_documents`. Backend gains `ocr_pool/page_warp.py` (detect + warp); the direct-mode plan in `registry_review/privacy.py` carries an optional `quad` + `transform_manifest`, and `ocr_pool/llm.py::prepare_image` warps instead of cropping when `quad` is present. Everything downstream already works on the outgoing image.

**Tech Stack:** Python 3 (Pillow, OpenCV `cv2`, numpy, unittest) in `.venv-privacy-trial`; Next.js 16 / React / Drizzle / Postgres / vitest in `web/`.

**Spec:** `docs/superpowers/specs/2026-11-18-phone-capture-page-warp-design.md`

## Global Constraints
- Original image bytes and their `sha256` never change; the warp is a derived image recorded in `transform_manifest`.
- Page detection failure or exception ⇒ no `quad`; behaviour identical to today (`crop` = whole image).
- Acceptance gate: area ≥ 30% of image; convex; every interior angle 60°–120°; each side ≥ 25% of its opposite side; reject when all four corners lie within 1% of the image border.
- `quad` allowed only when `masks` and `mask_polygons` are empty (direct mode only).
- `transform_manifest = {kind: 'perspective_warp', quad, output_size: [w,h], source_size: [W,H], method: 'opencv_contour_v1'}`.
- No new dependencies. No image filters/contrast changes. No PDF. No quality gate.
- Commit only on user request (project rule); commit steps below are prepared, run when the user says so.
- Python: `.\.venv-senocr\Scripts\python.exe -X utf8 -m unittest discover -s tests` (Windows); OpenCV tests may need `.venv-privacy-trial` — use whichever has `cv2` and say which.

## Review Focus
1. Phone JPEG with EXIF rotation 90°: `quad` must be in the EXIF-transposed frame (same frame as `job['size']` and `prepare_image`). → Task 2 test `test_quad_uses_exif_oriented_frame`.
2. Page fills the frame (flatbed scan / screenshot): must give `None`, not a near-identity warp. → Task 1 test `test_full_frame_page_is_none`.
3. Old cases / plans without `quad` must produce byte-identical outgoing images. → Task 2 test `test_no_quad_bytes_unchanged`.
4. Two documents inserted in one transaction (same `created_at`) come back in `position` order. → Task 5 test.
5. Captured photo + gallery photos mixed: numbering follows list order, removal renumbers. → Task 6 test.

---

### Task 1: `ocr_pool/page_warp.py` — detect and warp

**Files:**
- Create: `ocr_pool/page_warp.py`
- Test: `tests/test_page_warp.py`

**Interfaces:**
- Produces:
  - `detect_page(image: PIL.Image.Image) -> list[list[int]] | None` — 4 points `[[x,y],…]` ordered TL, TR, BR, BL in the input image's pixel frame.
  - `warp_size(quad, source_size) -> tuple[int, int]` — `(w, h)`: mean of top/bottom lengths, mean of left/right lengths, rounded; scaled down so `max(w,h) <= max(source_size)`.
  - `warp(image: PIL.Image.Image, quad) -> PIL.Image.Image` — RGB, `cv2.warpPerspective`, `INTER_CUBIC`, `borderValue=(255,255,255)`, size from `warp_size`.
  - `manifest(quad, source_size, output_size) -> dict` — exact dict from Global Constraints.

- [ ] **Step 1: Write failing tests** (synthetic images built with numpy/PIL in the test):
  - `test_detects_tilted_page`: 2000×1500 gray (128) canvas, white quadrilateral with corners (300,200),(1700,260),(1650,1350),(250,1300), a few black horizontal lines inside → each returned corner within 2% of the longer image side of the truth, order TL,TR,BR,BL.
  - `test_warp_output_size`: `warp_size` of that quad equals `(round(mean top/bottom), round(mean left/right))` ±1; `warp(...).size` equals it.
  - `test_small_page_is_none`: white quad covering ~15% of canvas → `None`.
  - `test_full_frame_page_is_none`: all-white image with thin black text lines → `None`.
  - `test_noise_is_none`: random-noise image (seeded) → `None`.
  - `test_manifest_shape`: keys and values exactly as Global Constraints.
- [ ] **Step 2: Run** `python -X utf8 -m unittest tests.test_page_warp -v` → FAIL (module missing).
- [ ] **Step 3: Implement.** Detection on a copy scaled to long side 1000 px: grayscale → `GaussianBlur(5,5)` → `Canny(50,150)` → `dilate(iterations=2)` → `findContours(RETR_EXTERNAL)` → 5 largest → `approxPolyDP(0.02·perimeter)` → first 4-point candidate passing the gate; scale back, round to int. Order corners by sum/diff of coordinates.
- [ ] **Step 4: Run** tests → PASS.
- [ ] **Step 5: Commit** `git add ocr_pool/page_warp.py tests/test_page_warp.py` — "Detect the document page and warp it flat (OpenCV)".

### Task 2: plan validation and outgoing image (`ocr_pool/llm.py`)

**Files:**
- Modify: `ocr_pool/llm.py` (`privacy_plan` ~L95–120, `prepare_image` ~L123–150)
- Test: new `tests/test_prepare_image_warp.py`

**Interfaces:**
- Consumes: `page_warp.warp`, `page_warp.warp_size` (Task 1).
- Produces: plan entries may carry `quad` (4×`[int,int]`) and `transform_manifest` (dict); `prepare_image(body, plan)` returns the warped JPEG when `quad` present.

- [ ] **Step 1: Failing tests:**
  - `test_quad_plan_valid`: entry with `quad`, `masks=[]`, `mask_polygons=[]`, `reviewed=True` passes `privacy_plan`.
  - `test_quad_with_masks_rejected`: same + one mask → `ValueError`.
  - `test_bad_quad_rejected`: 3 points / negative / float → `ValueError`.
  - `test_prepare_image_warps`: synthetic tilted page JPEG + plan with detected `quad` → decoded output size == `warp_size(quad, source_size)`.
  - `test_quad_outside_image_rejected`: point beyond width → `ValueError`.
  - `test_no_quad_bytes_unchanged`: same image, plan without `quad` → output size equals `crop` size and bytes equal those from the plan with `quad`/`transform_manifest` keys absent (compute before/after on `git stash`-free copy: store golden SHA-256 produced by the current code in the test, generated once before Step 3).
  - `test_quad_uses_exif_oriented_frame`: JPEG saved with EXIF Orientation=6; quad detected on `ImageOps.exif_transpose(img)`; `prepare_image` accepts it (no "outside image" error) and output is portrait.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `privacy_plan`: optional `quad` validation per tests; `transform_manifest` allowed only alongside `quad`. `prepare_image`: after `exif_transpose`, if `plan.get('quad')`: bounds check (0 ≤ x ≤ width, 0 ≤ y ≤ height), `image = warp(image, quad)`, skip crop/mask code; else unchanged.
- [ ] **Step 4: Run** new tests + `tests.test_llm_intake` → PASS.
- [ ] **Step 5: Commit** — "Outgoing image warps the detected page when the plan carries a quad".

### Task 3: direct-mode plan detects the page (`registry_review/privacy.py`, `ocr_pool/llm_workflow.py`)

**Files:**
- Modify: `registry_review/privacy.py` (direct branch ~L172–212)
- Modify: `ocr_pool/llm_workflow.py` (~L828–829 provenance text; confirm `doc['privacy']` is the plan entry so `transform_manifest` reaches `evidence.region` at L355)
- Test: existing privacy/intake tests file (find with `grep -ln "prototype_direct_llm" tests/`)

**Interfaces:**
- Consumes: `detect_page`, `warp_size`, `manifest` (Task 1); plan keys from Task 2.
- Produces: `automatic_plan` for direct jobs = `{sha256, crop, masks, mask_polygons, proposal_id, automatic, reviewed, direct_llm}` + (`quad`, `transform_manifest`) when detected; `proposal.crop_reason = 'prototype_direct_llm_page_warp'` when detected.

- [ ] **Step 1: Failing tests:**
  - `test_direct_plan_has_quad_when_page_found`: direct flag on, source = synthetic tilted page → `automatic_plan['quad']` length 4, `transform_manifest.kind == 'perspective_warp'`, `crop_reason == 'prototype_direct_llm_page_warp'`.
  - `test_direct_plan_without_page_unchanged`: source = full-frame white page → no `quad`, `crop == [0,0,*size]`, `crop_reason == 'prototype_direct_llm'`.
  - `test_detect_exception_falls_back`: patch `detect_page` to raise → job `completed`, no `quad`.
  - `test_intake_validates_quad_plan`: `validate_intake_plans([automatic_plan])` passes; tampered `quad` → `ValueError`.
  - Evidence: run the existing direct-mode workflow test (fake extractor) with a quad plan → `evidence[*].region.transform_manifest` present.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** In the direct branch open `folder/'source'`, `exif_transpose`, `detect_page`; wrap in try/except → log + `None`. Add keys to `plan`/`automatic`. Update the direct provenance sentence to: `'Synthetic prototype: direct_llm documents send the full oriented image, or the detected page warped flat, without masks or local OCR'`.
- [ ] **Step 4: Run** full Python suite + `node tests/review_intake_ui_smoke.cjs` (and other `*_smoke.cjs`) → all PASS.
- [ ] **Step 5: Commit** — "Direct prototype flattens the detected page before sending".

### Task 4: visual check on sample images (no product code)

**Files:**
- Create: `scripts/preview_page_warp.py` (CLI: `--images <dir>... --out <dir>`; writes `<name>-quad.jpg` with the quad drawn and `<name>-warp.jpg`, prints `name W×H found|none ms`).

- [ ] **Step 1:** Run on `examples/inputs`, `examples/inputs2`, `examples/bn3`, `research/synthetic-20261116e/BN-02-k0`, `research/synthetic-20261116f/BN-01-k0`, output to scratchpad.
- [ ] **Step 2:** Look at every `-quad.jpg`; tabulate correct / none / wrong. Any **wrong** (quad not the page edge) ⇒ tighten the gate in Task 1 with a regression test built from that case's geometry, re-run. Done when wrong = 0.
- [ ] **Step 3:** Report table to user (counts + 2–3 example images).

### Task 5: image order column (web)

**Files:**
- Modify: `web/src/db/schema.ts` (`uploadedDocuments`: `position: integer("position").notNull().default(0)`)
- Create: `web/deploy/migrations/20261118-document-position.sql` (`ALTER TABLE uploaded_documents ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;`)
- Modify: `web/src/lib/submissionsService.ts` (insert loop ~L622: `position: index`; query ~L393 order)
- Modify: `web/src/lib/intakeOrchestrator.ts` (~L167 order)
- Test: `web/tests/submissions.test.ts` (or `intakeOrchestrator.test.ts`)

**Interfaces:**
- Produces: documents of a submission always read with `.orderBy(uploadedDocuments.position, uploadedDocuments.createdAt)`.

- [ ] **Step 1: Failing test** `documents keep submitted order`: create a submission with files `["c.jpg","a.jpg","b.jpg"]` → stored `position` = 0,1,2 and both read paths return `c,a,b`.
- [ ] **Step 2: Run** `cd web && npx vitest run tests/submissions.test.ts` → FAIL.
- [ ] **Step 3: Implement** per Files list; check the test DB setup applies schema (`tests/helpers`) — add column there if it uses SQL.
- [ ] **Step 4: Run** vitest (all), `npx tsc --noEmit`, `npx eslint src` → PASS/clean.
- [ ] **Step 5: Commit** — "Uploaded images keep their submitted order".

### Task 6: camera button and numbered list (web)

**Files:**
- Modify: `web/src/components/upload/PatientUploadView.tsx` (second hidden input next to `#upload-file-input` ~L384)
- Modify: `web/src/data/uploadTranslations.ts` (vi: `"Chụp ảnh"`, en: `"Take photo"`; item label vi `"Ảnh {n}"`, en `"Image {n}"`)
- Test: `web/tests/patientUploadCapture.test.tsx` (new; follow `patientTabs.test.ts`/`centerNotice.test.tsx` render style, no jsdom)

**Interfaces:**
- Consumes: existing `addFiles(FileList | null)`.

- [ ] **Step 1: Failing tests:** rendered markup contains an input `id="upload-camera-input"` with `accept="image/*"` and `capture="environment"` and no `multiple`; a label `htmlFor="upload-camera-input"` with the translated text; list items labelled "Ảnh 1", "Ảnh 2" in list order (extract numbering into a pure helper `fileLabel(index, language)` to test without DOM; after removing item 1, the remaining item is "Ảnh 1").
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; camera input `onChange` → `addFiles(e.target.files); e.target.value = ""`.
- [ ] **Step 4: Run** vitest, tsc, eslint, `npm run build` → PASS.
- [ ] **Step 5: Commit** — "Patients can take a photo from the upload page; images are numbered in order".

### Task 7: verify and deploy

- [ ] **Step 1:** Full Python unittest + smokes; web vitest/tsc/eslint/build — record counts.
- [ ] **Step 2:** Pilot: back up DB, apply `web/deploy/migrations/20261118-document-position.sql`, deploy web release, run `deploy_with_regression.sh` for backend; expect baselines unchanged (BN-01 60/77, BN-02 51/67, inputs 131/131, HOLD 3/3, bn3-real 141/141, 0 wrong).
- [ ] **Step 3:** On the tunnel with a phone: take 2 photos + pick 1 from gallery → submit → `/registry` shows warped pages, order "Ảnh 1..3" matches `G0000..G0002`; measure intake wall time vs. previous 80 s for 4 images.
- [ ] **Step 4:** Update `SESSION-HANDOFF.md` top section.

## Delegation
Tasks 5–6 (web) can go to Codex in `lupiva-delegate/codex-web` (`git archive HEAD web`); Tasks 1–3 to Qoder/Codex in a code-only copy. Claude reviews diffs and reruns all tests in the main repo before any commit. Tasks 4 and 7 stay with Claude.
