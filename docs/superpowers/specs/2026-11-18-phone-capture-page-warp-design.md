# Chụp ảnh bằng điện thoại, giữ thứ tự ảnh, nắn phẳng trang hồ sơ (OpenCV)

Ngày: 18/11/2026 · Nhánh `pkien-integrate-ui` · Trạng thái: phần 1–2 (camera, thứ tự ảnh) đã làm; **phần 3 (nắn trang OpenCV trên server) đã hủy 19/11** theo quyết định của user. Trên 33 ảnh `inputs`/`inputs2`, bản OpenCV cuối chỉ nắn được 9 ảnh, một số vẫn còn nền. Hướng cân nhắc tiếp: opencv.js tìm 4 góc trên điện thoại ngay sau khi chụp, bệnh nhân kéo chỉnh, server nắn theo 4 góc đó. Code đã hủy còn ở `lupiva-delegate/codex-warp` (đã commit) và bản patch trong scratchpad của phiên 18–19/11.

## Mục đích
Bệnh nhân nộp hồ sơ chủ yếu bằng điện thoại. Họ cần chụp thẳng từ trang Nộp hồ sơ, không phải chụp trước rồi tìm ảnh trong thư viện. Ảnh chụp tay thường lẫn nền bàn và bị nghiêng phối cảnh. Nắn phẳng để chỉ còn đúng tờ hồ sơ giúp LLM (sau này là OCR GPU) đọc bảng ổn định hơn, và bác sĩ dễ đối chiếu hơn.

## Mục tiêu
1. Nút **Chụp ảnh** trên trang Nộp hồ sơ mở camera gốc của máy. Mỗi lần chụp thêm một ảnh vào cùng danh sách với ảnh chọn từ thư viện.
2. **Thứ tự ảnh = thứ tự trong danh sách lúc nộp**, giữ nguyên qua web → backend. "Ảnh 2" phải là cùng một ảnh ở mọi màn hình và với mọi mã `G0001`.
3. Backend (chế độ prototype `LUPIVA_PROTOTYPE_DIRECT_LLM`) **tự tìm 4 góc tờ giấy bằng OpenCV và nắn phẳng**. Ảnh gửi LLM và ảnh nguồn bác sĩ xem là trang đã nắn.

## Không làm (lần này)
- Kiểm tra chất lượng ảnh (mờ/tối/nhỏ): user chốt coi ảnh đều tốt.
- Bộ lọc scan đen trắng, chỉnh tương phản: ảnh không bị sửa ngoài phép nắn hình học.
- Nắn trang ở luồng thường (OCR local + che PII): tọa độ che và các luồng nhanh (`lab_crop_evidence`, `local_report_row`) đang tính theo `crop` hình chữ nhật. Để dành cho bản OCR GPU.
- Chụp trong trang bằng `getUserMedia` (dialog của dlvanh): chỉ được 1080p, kém hơn camera gốc.
- PDF.

## Ràng buộc
- **Ảnh gốc không đổi**: hash `sha256` của ảnh gốc vẫn là khóa của plan và của intake. Ảnh nắn là ảnh dẫn xuất và phải ghi lại phép biến đổi.
- Không tìm được trang chắc chắn thì giữ đúng hành vi hiện tại (gửi cả ảnh), không bao giờ cắt sai.
- Không thêm phụ thuộc mới: OpenCV đã có trong `.venv-privacy-trial`, là môi trường server chạy trên pilot.
- Chi phí đo trên pilot: khoảng 0,2 s/ảnh 1920×2560, so với 26–59 s gọi LLM.

## Các cách đã cân nhắc
- **A. Cắt hình chữ nhật bao quanh trang** (dùng lại `crop`): an toàn, nhưng ảnh nghiêng vẫn còn nền và không phẳng.
- **B. Nắn phẳng 4 góc (perspective warp)**: **user chọn.** Trang phẳng, chỉ còn tờ giấy. Phải thêm kiểu biến đổi mới vào plan.
- **C. Xử lý trên điện thoại bằng opencv.js**: loại. Thư viện khoảng 8 MB, và ảnh gửi lên đã bị sửa nên mất ảnh gốc.

## Thiết kế

### 1. Web: nút chụp ảnh (`PatientUploadView.tsx`)
- Thêm nút "Chụp ảnh" bên cạnh "Chọn tệp". Nút mở `<input type="file" accept="image/*" capture="environment">`, không chọn nhiều. Mỗi ảnh chụp được nối vào cuối danh sách `files`, qua cùng bước kiểm tra kích thước/định dạng như ảnh chọn từ thư viện.
- Trên máy tính, `capture` bị bỏ qua và nút mở hộp chọn tệp. Chấp nhận được, không cần ẩn.
- Danh sách hiện số thứ tự "Ảnh 1, 2, 3…" theo thứ tự trong danh sách. Có nút xóa từng ảnh (đã có). Không làm kéo-thả sắp xếp.
- Thêm chuỗi dịch trong `uploadTranslations.ts` (vi/en).

### 2. Web: cột thứ tự ảnh
- `uploaded_documents.position integer` (migration Drizzle, mặc định 0 cho hàng cũ).
- `submissionsService.ts`: vòng ghi `for (const file of input.files)` ghi `position = index`.
- Mọi chỗ `.orderBy(uploadedDocuments.createdAt)` cho tài liệu của một hồ sơ (`intakeOrchestrator.ts:167`, `submissionsService.ts:393`) đổi thành `.orderBy(position, createdAt)`.
- Backend Python giữ thứ tự nhận (`ORDER BY rowid`), không cần đổi.

### 3. Backend: tìm trang và nắn phẳng
**Module mới `ocr_pool/page_warp.py`:**
- `detect_page(image) -> quad | None`. Ảnh vào đã `exif_transpose`. Thu ảnh về cạnh dài 1000 px → xám → Gaussian → Canny → dilate → contour ngoài, xét 5 contour lớn nhất → `approxPolyDP` lấy 4 điểm.
- **Chốt chấp nhận** (không đạt thì trả `None`):
  - diện tích tứ giác chiếm ≥ 30% ảnh;
  - tứ giác lồi;
  - mỗi góc trong khoảng 60°–120°;
  - không có cạnh nào ngắn hơn 25% cạnh đối diện;
  - tứ giác không trùng gần hết khung ảnh (mọi góc cách mép ảnh < 1%): khi đó nắn không có ích, coi như `None`.
- Sắp 4 góc theo thứ tự trên-trái, trên-phải, dưới-phải, dưới-trái. Tọa độ nguyên trên ảnh đã xoay EXIF, kích thước gốc.
- `warp_size(quad)`: rộng = trung bình hai cạnh ngang, cao = trung bình hai cạnh dọc (làm tròn). Không phóng to quá cạnh dài của ảnh gốc.
- `warp(image, quad) -> image`: `getPerspectiveTransform` + `warpPerspective` (INTER_CUBIC, nền trắng).

**Plan (`registry_review/privacy.py`, nhánh `direct`):**
- Đọc ảnh nguồn và gọi `detect_page`. Có `quad` thì plan có thêm `quad=[[x,y]×4]` và `crop_reason='prototype_direct_llm_page_warp'`. Không có thì giữ như cũ (`crop` = cả ảnh).
- `automatic` plan (đã có `sha256, crop, masks, mask_polygons…`) thêm khóa `quad` khi có. `validate_intake_plans` so khớp toàn bộ entry nên tự bao luôn `quad`.
- Lỗi khi phát hiện (exception) thì ghi log, coi như `None`. Không làm hỏng intake.

**Kiểm tra plan (`ocr_pool/llm.py::privacy_plan`):**
- `quad` không bắt buộc. Nếu có: list 4 điểm `[int,int]` ≥ 0. Chỉ cho phép khi `masks` và `mask_polygons` rỗng (tức chế độ direct). Ngược lại báo lỗi.

**Tạo ảnh gửi đi (`ocr_pool/llm.py::prepare_image`):**
- Có `quad`: kiểm tra 4 điểm nằm trong ảnh, rồi `warp(image, quad)` thay cho `image.crop(crop)`. Không có `quad`: giữ nguyên code hiện tại.
- Ảnh ra vẫn là JPEG q95, bỏ EXIF như hiện nay. Mọi thứ phía sau (`outgoing_bytes`, `crops/<tid>.png`, `row_box` 0–1000 theo ảnh gửi đi, header `HEADER` crops, vùng bảng) đều tính trên ảnh đã nắn nên **không phải sửa**.

**Ghi nguồn gốc:**
- Plan direct có `quad` thì `doc['privacy']['transform_manifest'] = dict(kind='perspective_warp', quad=..., output_size=[w,h], source_size=[W,H], method='opencv_contour_v1')`. `llm_workflow.py:355` đã chép `transform_manifest` vào `evidence.region`, nên bác sĩ hoặc audit luôn biết ảnh nguồn hiển thị là ảnh nắn từ ảnh gốc nào.
- Dòng `provenance['privacy']` của direct đổi thành "…send the full oriented image, or the detected page warped flat, without masks or local OCR".

### 4. Kiểm thử
- Python (`tests/test_page_warp.py`, mới):
  - Ảnh tổng hợp: nền xám có một tứ giác trắng nghiêng chứa vài dòng kẻ → tìm đúng 4 góc (sai số ≤ 2% cạnh), ảnh nắn đúng kích thước.
  - Ảnh không có trang (nhiễu, ảnh trắng toàn khung) → `None`.
  - Tứ giác nhỏ (< 30%) → `None`.
- `prepare_image`: plan có `quad` → kích thước ra = `warp_size`. `quad` kèm `masks` → lỗi. Plan không `quad` → byte giống hệt trước khi sửa.
- `privacy.py`: direct + runner giả → plan có `quad` khi phát hiện được, không có khi không.
- Web (vitest): `position` ghi theo index; truy vấn tài liệu của hồ sơ trả đúng thứ tự `position` khi `created_at` trùng.
- Toàn bộ Python unittest + smokes, vitest/tsc/eslint/build, cổng `deploy_with_regression` (luồng thường phải giữ mốc vì không đổi).
- **Kiểm bằng mắt** trước khi deploy: chạy `detect_page` + `warp` trên các ảnh mẫu (`examples/inputs`, `inputs2`, `bn3`, synthetic), lưu ảnh có vẽ tứ giác ra thư mục scratchpad, xem từng ảnh. Ghi số ảnh tìm đúng / bỏ qua / sai.

## Để lại cho người làm
- Ngưỡng Canny/dilate cụ thể, miễn qua được bộ ảnh mẫu.
- Giao diện nút chụp ảnh, theo kiểu nút đang có.

## Việc tiếp sau (không thuộc lần này)
- Đưa nắn trang vào luồng OCR GPU chính thức (tọa độ che PII phải đi qua phép nắn).
- Kiểm tra chất lượng ảnh nếu thực tế cần.
