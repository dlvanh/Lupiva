# Cổng bệnh nhân, dashboard bác sĩ và thông báo giữa trang — thiết kế

Ngày: 18/11/2026 · Nhánh: `pkien-integrate-ui` · App: `web/` (Next 16, Drizzle/Postgres)

## Mục đích
Góp ý của thầy/cô hướng dẫn: website cần có nội dung cho bệnh nhân (tham khảo
https://urticaria-registry.com/for-patients/), màn hình cảm ơn sau khi nộp,
dashboard bác sĩ theo trạng thái hồ sơ, và thông báo khi có hồ sơ mới. Thêm
(user): thông báo cho bệnh nhân khi tải lên thành công.

## Mục tiêu
1. **Trang chủ cho bệnh nhân**, song ngữ Việt/Anh, **mặc định tiếng Việt**:
   - Giới thiệu dự án (registry lupus/SLE, bác sĩ chuyên khoa duyệt, dữ liệu giả danh).
   - Quyền lợi: **Điều trị tốt hơn (Improved Treatment)**, **Ẩn danh và bảo mật
     (Anonymity and Security)** — mỗi mục một thẻ, bố cục như CURE.
   - Cách đăng ký: **B1. Hoàn thiện E-consent** → **B2. Tải hồ sơ lên**.
   - Khối liên hệ: tên + email chủ nhiệm dự án = **chỗ trống "…" / "[đang cập nhật]"**.
2. **E-consent** = chỉ **một nút bấm** "Tôi đồng ý tham gia (E-consent)", chưa có
   nội dung phiếu. Bấm → ghi cờ `consentSigned` có sẵn (đã có ở register/login).
   Đã đồng ý thì B1 hiện "✓ Đã hoàn thiện" và mở B2.
3. **Hộp "Nộp hồ sơ thành công"** giữa màn hình (nền mờ, dấu ✓ lớn, kiểu "chuyển
   khoản thành công") sau khi bệnh nhân tải lên thành công, thay toast nhỏ hiện tại.
   Nội dung: "Cảm ơn bạn đã nộp hồ sơ tới dự án… thông tin của bạn sẽ được chuyển đến
   các bác sĩ chuyên khoa. Nếu có bất kỳ thắc mắc gì bạn vui lòng liên hệ tới chủ
   nhiệm dự án, email …, chúng tôi sẵn sàng hỗ trợ giải đáp." + mã hồ sơ, số tệp,
   nút [Xem trạng thái] [Về trang chủ]. Chỉ thông tin trạng thái (bệnh nhân
   không thấy CRF/dữ liệu).
4. **Dashboard bác sĩ** 5 mục: **Hồ sơ mới · Chưa phê duyệt · Đã phê duyệt · CRF ·
   REDCap** (số đếm trên 3 mục đầu).
   - Hồ sơ mới = chưa bác sĩ nào mở (`first_opened_at IS NULL`).
   - Chưa phê duyệt = đã mở, `status = pending_doctor_review`.
   - Đã phê duyệt = `status = approved`.
   - CRF = lối vào `/crf-form`. REDCap = tải file REDCap qua backend
     (`/api/exports/options|preview|create|download` đã có trong `registry_review/server.py`).
5. **Thông báo hồ sơ mới cho bác sĩ**: hộp giữa trang cùng kiểu "Có N hồ sơ mới"
   [Mở hồ sơ] [Để sau]; số đếm trên menu. Mỗi hồ sơ chỉ báo một lần mỗi phiên trình duyệt.

## Không làm
- Web Push / thông báo hệ điều hành / email / SMS.
- Nội dung phiếu E-consent, chữ ký, PDF đồng thuận.
- SSE/WebSocket.
- Thay đổi luồng OCR/CRF/backend Python (chỉ thêm đường proxy cho export REDCap).

## Phản mục tiêu
- Bệnh nhân thấy được dữ liệu CRF/OCR hay hồ sơ người khác.
- Bác sĩ bị báo lặp mãi cùng một hồ sơ, hoặc hai bác sĩ thấy số "mới" khác nhau.
- Hộp thông báo che mất thao tác mà không đóng được (phải đóng bằng nút, Esc, bấm nền).

## Cách tiếp cận (đã chọn: 1)
1. **Cột DB `first_opened_at` + hỏi định kỳ ~20 s (chọn).** Đúng cho mọi bác sĩ/mọi
   máy; cần migration nhỏ trên Postgres pilot (backup trước).
2. localStorage đánh dấu đã xem — không migration nhưng mỗi máy một số, không hợp
   dashboard dùng chung. Loại.
3. SSE/WebSocket thời gian thực — dễ đứt qua tunnel Cloudflare, nặng hơn mức cần. Loại.

## Thiết kế kỹ thuật
- **DB**: `crf_submissions.first_opened_at timestamptz NULL`,
  `first_opened_by_user_id uuid NULL` (FK users, set null). Migration drizzle.
  Hồ sơ cũ: để NULL (pilot đang 0 hồ sơ).
- **API**:
  - `POST /api/submissions/[id]/opened` (specialist): set nếu còn NULL, audit log
    `submission_opened`. Gọi khi bác sĩ mở hồ sơ (trang Hồ sơ Bệnh nhân / Duyệt hồ sơ).
  - `GET /api/submissions` thêm filter `status=new|pending_opened|approved|all` và
    stats `{new, pending, approved, total}`.
  - `GET /api/submissions/new-count?since=<iso>` (specialist): `{count, latest:[{id, code, submittedAt}]}`.
  - Proxy REDCap: thêm `/api/exports/options|preview|create` và `/api/exports/download`
    vào allowlist `web/src/lib/pipeline.ts`, chỉ specialist.
- **UI dùng chung**: `CenterNotice` (modal giữa trang, role="alertdialog",
  focus trap, Esc/nền đóng, biến thể success/info) trong `web/src/components/`.
- **Bác sĩ**: `NewSubmissionWatcher` gắn trong layout khi role = specialist,
  hỏi 20 s/lần (dừng khi tab ẩn, hỏi ngay khi tab hiện lại); id đã báo lưu
  sessionStorage. Badge số đếm trên Navbar.
- **i18n**: chuỗi mới vào `TRANSLATIONS` (vi + en); mặc định `"vi"` ở
  `LupivaContext.tsx` (localStorage vẫn giữ lựa chọn của người dùng).

## Phân công
- **Codex CLI** (bản sao code-only trong `lupiva-delegate`): phần bệnh nhân —
  trang chủ, nút E-consent, hộp nộp thành công, `CenterNotice`, mặc định tiếng Việt.
- **Claude**: DB/API/dashboard bác sĩ/thông báo hồ sơ mới/REDCap; review code Codex,
  chạy `npm test`, `npm run lint`, `npm run build` trong repo chính.

## Để người làm tự quyết
Màu sắc/biểu tượng theo phong cách hiện có (teal/slate, Tailwind); câu chữ giới
thiệu dự án (bản nháp, thầy/cô duyệt sau); chu kỳ hỏi chính xác (15–30 s).

## Kiểm tra
- vitest: filter/stats mới, `opened` idempotent, patient bị 403 ở mọi API mới.
- Thử tay: bệnh nhân đăng ký → E-consent → tải ảnh → hộp thành công; bác sĩ ở tab
  khác thấy hộp "1 hồ sơ mới" trong ≤30 s; mở hồ sơ → chuyển sang "Chưa phê duyệt";
  duyệt → "Đã phê duyệt"; tải được file REDCap.
- Deploy pilot chỉ sau khi user đồng ý (có migration).
