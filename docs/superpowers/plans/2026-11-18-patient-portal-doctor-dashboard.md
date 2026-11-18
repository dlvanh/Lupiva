# Cổng bệnh nhân, dashboard bác sĩ, thông báo giữa trang — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang chủ cho bệnh nhân (vi mặc định) + nút E-consent + hộp "Nộp hồ sơ thành công" giữa trang; dashboard bác sĩ 5 mục với thông báo hồ sơ mới giữa trang và tải REDCap.

**Architecture:** Tất cả trong `web/` (Next 16 App Router, Drizzle/Postgres, vitest + PGlite). "Hồ sơ mới" = `crf_submissions.first_opened_at IS NULL`; bác sĩ hỏi `GET /api/submissions/new-count` mỗi 20 s. Một component modal dùng chung `CenterNotice`. REDCap đi qua proxy `/api/pipeline/*` có allowlist.

**Tech Stack:** Next 16, React 19, Tailwind 4, Drizzle 0.45, zod 4, vitest 3 (`tests/helpers/pgliteTestDb.ts`).

**Spec:** `docs/superpowers/specs/2026-11-18-patient-portal-doctor-dashboard-design.md`

## Global Constraints
- Mọi chuỗi giao diện mới có bản `vi` và `en` trong `web/src/data/translations.ts` (interface `Translations` + 2 khối `en`, `vi`); **mặc định `"vi"`**.
- Chỗ chưa có nội dung: email/tên chủ nhiệm = `"…"`; nội dung phiếu E-consent = không có (chỉ nút).
- Bệnh nhân **không** nhận CRF/OCR/dữ liệu người khác; mọi API mới cho bác sĩ dùng `requireAuth(["specialist"])`; API ghi dùng `verifySameOrigin` như `web/src/app/api/submissions/[id]/retry/route.ts`.
- Không Web Push, không email/SMS, không SSE/WebSocket. Không sửa backend Python.
- Màu/kiểu theo Tailwind teal/slate sẵn có. Commit message tiếng Anh, kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Kiểm tra mỗi task: `cd web && npx vitest run <file>`; cuối: `npm test && npm run lint && npm run build`.

## Review Focus
1. Bác sĩ hai tab/hai máy: hồ sơ đã mở ở máy A không còn là "mới" ở máy B; `opened` gọi lặp không đổi `first_opened_at` (test Task 4).
2. Bệnh nhân gọi `new-count`, `opened`, proxy export → 403 (test Task 4, 6, 7).
3. Watcher không bật lại hộp cho cùng hồ sơ sau khi đóng / chuyển trang (sessionStorage) và dừng hỏi khi đăng xuất (test Task 6).
4. Tải lên thất bại không hiện hộp thành công; tải lên thành công thì hộp hiện cả khi người dùng chọn tiếng Anh (test Task 3).
5. Hộp `CenterNotice` đóng được bằng Esc, nút, bấm nền; focus về lại phần tử trước đó (test Task 1).

---

### Task 1: `CenterNotice` + mặc định tiếng Việt  *(Codex)*

**Files:**
- Create: `web/src/components/CenterNotice.tsx`
- Modify: `web/src/context/LupivaContext.tsx:139` (`return "en"` → `return "vi"`), `web/src/app/layout.tsx:32` (`lang="vi"`)
- Test: `web/tests/centerNotice.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  export interface CenterNoticeAction { label: string; onClick: () => void; variant?: "primary" | "secondary"; id?: string }
  export interface CenterNoticeProps {
    open: boolean; tone: "success" | "info"; title: string; children?: React.ReactNode;
    actions: CenterNoticeAction[]; onClose: () => void; id?: string;
  }
  export function CenterNotice(props: CenterNoticeProps): JSX.Element | null
  ```
  Modal cố định giữa màn hình, nền `bg-slate-900/50`, `role="alertdialog"`, `aria-modal`, `aria-labelledby` = tiêu đề; icon tròn lớn (✓ teal cho success, chuông cho info); Esc/bấm nền gọi `onClose`; focus nút primary khi mở, trả focus khi đóng.

- [ ] **Step 1: Test** (`@testing-library/react` nếu đã có, nếu không dùng `react-dom/client` + jsdom như `tests/emptyCrfPages.test.tsx`):
  - `renders nothing when closed`: `open=false` → không có `[role=alertdialog]`.
  - `shows title, body and actions`: tiêu đề "Nộp hồ sơ thành công!" hiển thị; 2 nút.
  - `closes on Escape and backdrop`: keydown Escape → `onClose` 1 lần; click backdrop → thêm 1 lần; click trong hộp → không gọi.
  - `default language is vi`: render `LupivaProvider` với localStorage rỗng → `language === "vi"`.
- [ ] **Step 2:** `npx vitest run tests/centerNotice.test.tsx` → FAIL.
- [ ] **Step 3:** Implement như Interfaces; đổi mặc định ngôn ngữ.
- [ ] **Step 4:** Chạy lại → PASS; `npx vitest run` không vỡ test cũ (sửa test cũ nào ngầm giả định `en` mặc định bằng cách set `localStorage["lupiva-lang"]="en"` trong test đó).
- [ ] **Step 5:** Commit `"Centre-of-page notice component; Vietnamese is the default language"`.

### Task 2: Trang chủ cho bệnh nhân + nút E-consent  *(Codex)*

**Files:**
- Modify: `web/src/app/page.tsx` (giữ hero; thay khối "3-Step Clinical OCR Workflow" bằng các khối dưới khi người xem không phải specialist; specialist vẫn thấy khối workflow cũ)
- Create: `web/src/components/landing/PatientInfoSections.tsx`
- Modify: `web/src/data/translations.ts` (thêm `t.patientPortal`)
- Modify: `web/src/app/login/page.tsx` (đọc `?mode=register&consent=1` → mở chế độ đăng ký, tích sẵn ô consent)
- Test: `web/tests/patientLanding.test.tsx`

**Interfaces:**
- Produces: `t.patientPortal` với khóa: `aboutTitle, aboutBody, benefitsTitle, benefitImprovedTitle, benefitImprovedBody, benefitAnonTitle, benefitAnonBody, howTitle, step1Title, step1Body, step1Btn, step1Done, step2Title, step2Body, step2Btn, contactTitle, contactLeadLabel, contactLead ("…"), contactEmail ("…"), successTitle, successBody, successCodeLabel, successFilesLabel, successStatusBtn, successHomeBtn`. (Task 3 dùng các khóa `success*` và `contact*`.)
- Bố cục theo CURE: Giới thiệu → H2 "Quyền lợi của bệnh nhân" 2 thẻ ("Điều trị tốt hơn / Improved Treatment", "Ẩn danh và bảo mật / Anonymity and Security") → "Cách thức đăng ký" 2 bước có số → khối "Liên hệ" chữ thường.
- Bước 1 nút "Hoàn thiện E-consent":
  - chưa đăng nhập → `Link` tới `/login?mode=register&consent=1`;
  - bệnh nhân đã đăng nhập và `currentUser.consentSigned` → hiện "✓ Đã hoàn thiện E-consent", không nút.
- Bước 2 nút "Tải hồ sơ lên" → `/upload` (chưa đăng nhập thì `/login?next=/upload`).
- Câu chữ giới thiệu (bản nháp): registry lupus ban đỏ hệ thống (SLE) của dự án Lupiva; hồ sơ được bác sĩ chuyên khoa duyệt; dữ liệu được giả danh hóa. Quyền lợi: dữ liệu giúp tìm ra chiến lược điều trị tốt hơn; dữ liệu được giả danh hóa, không liên kết được với thông tin cá nhân.

- [ ] **Step 1: Test:**
  - `shows patient sections in Vietnamese by default`: có "Quyền lợi", "Điều trị tốt hơn", "Ẩn danh và bảo mật", "Hoàn thiện E-consent", "Tải hồ sơ lên", "Liên hệ".
  - `english toggle`: language `en` → "Improved Treatment", "Anonymity and Security".
  - `consent button links to register`: chưa đăng nhập → href `/login?mode=register&consent=1`.
  - `consent done for signed patient`: user patient `consentSigned: true` → có "Đã hoàn thiện", không có link register.
- [ ] **Step 2:** chạy → FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `"Patient landing: project intro, benefits, two-step sign-up with an e-consent button"`.

### Task 3: Hộp "Nộp hồ sơ thành công"  *(Codex)*

**Files:**
- Modify: `web/src/components/upload/PatientUploadView.tsx` (~dòng 237–250, sau `submitPatientUpload` trả về record)
- Modify: `web/src/context/LupivaContext.tsx:616-625` (bỏ toast cho nhánh patient; giữ toast lỗi)
- Test: `web/tests/patientSuccessNotice.test.tsx`

**Interfaces:**
- Consumes: `CenterNotice` (Task 1), `t.patientPortal.success*`, `contact*` (Task 2).
- Hộp: tone success, tiêu đề `successTitle` ("Nộp hồ sơ thành công!"), thân `successBody` = "Cảm ơn bạn đã nộp hồ sơ tới dự án. Thông tin của bạn sẽ được chuyển đến các bác sĩ chuyên khoa. Nếu có bất kỳ thắc mắc gì, bạn vui lòng liên hệ tới chủ nhiệm dự án {contactLead}, email {contactEmail}, chúng tôi sẵn sàng hỗ trợ giải đáp." + dòng mã hồ sơ và số tệp. Nút: `successStatusBtn` → cuộn tới danh sách trạng thái hồ sơ của bệnh nhân trên `/upload`; `successHomeBtn` → `/`.
- Chỉ áp dụng cho role patient; specialist giữ toast hiện tại.

- [ ] **Step 1: Test** (mock `submitPatientUpload`):
  - `shows success notice after upload`: resolve `{ id: "abc" }` với 2 file → alertdialog chứa `TRANSLATIONS.vi.patientPortal.successTitle` và "2".
  - `no notice on failure`: resolve `null` → không có alertdialog.
  - `english`: language en → chứa `TRANSLATIONS.en.patientPortal.successTitle`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `"Patients see a centre-of-page thank-you notice after a successful upload"`.

### Task 4: Cột "đã mở" + API `opened`  *(Claude)*

**Files:**
- Modify: `web/src/db/schema.ts` (`crfSubmissions`: `firstOpenedAt: timestamp("first_opened_at", { withTimezone: true })`, `firstOpenedByUserId: uuid("first_opened_by_user_id").references(() => users.id, { onDelete: "set null" })`, index `crf_submissions_first_opened_idx`)
- Create: `web/src/lib/submissionOpened.ts`, `web/src/app/api/submissions/[id]/opened/route.ts`
- Create: `web/deploy/migrations/20261118-first-opened.sql` (`ALTER TABLE … ADD COLUMN IF NOT EXISTS …`; `CREATE INDEX IF NOT EXISTS …`)
- Test: `web/tests/submissionOpened.test.ts`

**Interfaces:**
- Produces: `markSubmissionOpened(params: { user: AuthenticatedUserDTO; submissionId: string; db?: DatabaseClient }): Promise<{ firstOpenedAt: string; changed: boolean }>` — `UPDATE … SET first_opened_at = now(), first_opened_by_user_id = $user WHERE id = $id AND first_opened_at IS NULL`; không tìm thấy id → `UploadError(404)` (lớp lỗi có sẵn trong `submissionUploads.ts`).
- Route `POST /api/submissions/[id]/opened` → `200 { firstOpenedAt, changed }`; audit `submission.opened` chỉ khi `changed`.

- [ ] **Step 1: Test** (pattern `tests/submissionRetry.test.ts`):
  - `marks once`: gọi 2 lần → lần 1 `changed: true`, lần 2 `changed: false`, `firstOpenedAt` không đổi; 1 dòng audit `submission.opened`.
  - `patient forbidden`: session patient → 403.
  - `unknown id`: 404.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `"Record when a doctor first opens a submission"`.

### Task 5: Bộ lọc & số đếm "mới / chưa duyệt / đã duyệt"  *(Claude)*

**Files:**
- Modify: `web/src/lib/submissionFilters.ts:4-8` → `SUBMISSION_REVIEW_FILTERS = ["all", "new", "pending_doctor_review", "approved"]`
- Modify: `web/src/lib/submissionsService.ts` (`querySubmissions`: điều kiện lọc; `SubmissionStatsDTO` thêm `new: number`; `pending` = đã mở & chưa duyệt; `SubmissionItemDTO` thêm `firstOpenedAt: string | null`)
- Test: thêm case vào `web/tests/submissions.test.ts`

**Interfaces:**
- `status=new` ⇔ `first_opened_at IS NULL AND status='pending_doctor_review'`; `status=pending_doctor_review` ⇔ `first_opened_at IS NOT NULL AND status='pending_doctor_review'`; `approved` không đổi. `stats.total = new + pending + approved`.
- Patient: không nhận `firstOpenedAt` (giữ `toPatientStatus`).

- [ ] **Step 1: Test** `splits new from opened pending`: seed 12 hồ sơ, mở 2 hồ sơ pending bằng `markSubmissionOpened` → `stats.new` giảm 2, `stats.pending` tăng 2; `status=new` không chứa 2 id đó.
- [ ] **Step 2–4.** Sửa test cũ đang assert `stats.pending` cho khớp định nghĩa mới.
- [ ] **Step 5:** Commit `"Submission list separates new (never opened) from opened-but-unapproved"`.

### Task 6: Thông báo hồ sơ mới cho bác sĩ  *(Claude)*

**Files:**
- Create: `web/src/app/api/submissions/new-count/route.ts`
- Create: `web/src/components/NewSubmissionWatcher.tsx` (gắn trong `web/src/app/layout.tsx` bên trong `LupivaProvider`)
- Modify: `web/src/components/Navbar.tsx:66` (badge số hồ sơ mới cạnh "Hồ sơ Bệnh nhân")
- Modify: `web/src/components/upload/DoctorSubmissionsView.tsx` (gọi `POST …/opened` khi bác sĩ mở tài liệu `onOpenDocument`, bấm "Duyệt" `onOpenRegistry`, hoặc mở thẻ chi tiết)
- Test: `web/tests/newSubmissions.test.ts`, `web/tests/newSubmissionWatcher.test.tsx`

**Interfaces:**
- `GET /api/submissions/new-count` (specialist) → `{ count: number; latest: { id: string; submittedAt: string }[] }` (≤5, mới nhất trước, chỉ hồ sơ "new").
- Context: thêm vào `LupivaContext` `newSubmissionCount: number` + `setNewSubmissionCount` (Navbar đọc).
- Watcher: chỉ chạy khi `currentUser?.role === "specialist"`; hỏi ngay khi mount, rồi mỗi `20_000` ms; `document.hidden` → bỏ lượt; `visibilitychange` hiện lại → hỏi ngay. Id đã báo lưu `sessionStorage["lupiva-notified-submissions"]` (try/catch). Có id chưa báo → `CenterNotice` tone info: "Có {n} hồ sơ mới" / "{n} new submission(s)", nút [Mở hồ sơ] → `/upload?status=new`, [Để sau] → đóng. Đăng xuất → dừng interval.
- `DoctorSubmissionsView` đọc `?status=new` từ URL làm filter ban đầu.

- [ ] **Step 1: Test API:** patient 403; specialist `count` = số hồ sơ chưa mở; sau `markSubmissionOpened` giảm 1.
- [ ] **Step 2: Test watcher** (fake timers, mock fetch): lần 1 trả 1 id → hiện hộp; đóng; tick 20 s trả cùng id → không hiện lại; trả id mới → hiện "Có 1 hồ sơ mới"; role patient → fetch không được gọi.
- [ ] **Step 3–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Commit `"Doctors get a centre-of-page notice and a menu badge for new submissions"`.

### Task 7: Dashboard 5 mục + tải REDCap  *(Claude)*

**Files:**
- Modify: `web/src/components/upload/DoctorSubmissionsView.tsx` (~dòng 785–860: thay nhóm nút trạng thái bằng thanh 5 thẻ: **Hồ sơ mới (n) · Chưa phê duyệt (n) · Đã phê duyệt (n) · CRF · REDCap**; 3 thẻ đầu đặt `filters.status` = `new|pending_doctor_review|approved`; CRF → `/crf-form`; REDCap → mở panel)
- Create: `web/src/components/upload/RedcapExportPanel.tsx`
- Modify: `web/src/lib/pipeline.ts:19-43` (GET `/api/exports/options`, `/api/exports/download`; POST `/api/exports/preview`, `/api/exports/create` → `["specialist"]`)
- Test: thêm case vào `web/tests/pipeline.test.ts`

**Interfaces:**
- Panel liệt kê hồ sơ `approved` có `pipelineIntakeId`; mỗi dòng nút "Tải REDCap": `caseForIntake(jobs, intakeId)` (`@/lib/crfEvidence`, như `CrfAdminFacts.tsx:68`) → `POST /api/pipeline/api/exports/preview {case_id}` → `POST /api/pipeline/api/exports/create {preview_id, format:"redcap"}` → tải từng file trong kết quả qua `GET /api/pipeline/api/exports/download?export_id=…&name=…` (đọc `registry_review/exports.py:131-208` để biết tên khóa trả về). Lỗi backend → thông báo đỏ trong panel.
- Kiểm tra `web/src/app/api/pipeline/[...path]/route.ts` có giữ `Content-Disposition` + bytes cho download; nếu không, bổ sung.

- [ ] **Step 1: Test** `allowedPipelineCall`: specialist được 4 đường export; patient bị từ chối cả 4.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Thử tay trên dev: duyệt 1 hồ sơ → REDCap → tải về file `.csv`.
- [ ] **Step 6:** Commit `"Doctor dashboard: new, unapproved, approved, CRF and REDCap; REDCap download through the pipeline proxy"`.

### Task 8: Kiểm tra toàn bộ và deploy pilot  *(Claude, cần user đồng ý)*

- [ ] `cd web && npm test && npm run lint && npm run build` → tất cả xanh.
- [ ] Hỏi user trước khi deploy. Pilot: `pg_dump` backup → chạy `deploy/migrations/20261118-first-opened.sql` qua `psql -v ON_ERROR_STOP=1` → release mới theo `deploy/PILOT-DEPLOY.md` §3.
- [ ] Thử tay trên tunnel: đăng ký bệnh nhân qua nút E-consent → tải ảnh → hộp cảm ơn; tab bác sĩ thấy hộp "Có 1 hồ sơ mới" ≤ 30 s; mở → sang "Chưa phê duyệt".
- [ ] Cập nhật `SESSION-HANDOFF.md`.

## Phân công thực thi
- Task 1–3: giao **Codex CLI** trong bản sao code-only `~/lupiva-delegate/<tên>` với `TASK.md` trích Task 1–3 + Global Constraints; Claude review diff, chép vào repo chính, chạy test.
- Task 4–5: Claude làm song song khi Codex chạy (không đụng file của Task 1–3). Task 6–7 chờ `CenterNotice` (Task 1) về repo chính.
