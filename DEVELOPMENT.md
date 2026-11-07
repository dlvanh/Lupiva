# Lupiva · Lupus Registry

Ứng dụng thử nghiệm xử lý hồ sơ lupus cục bộ: ảnh nguồn → layout/OCR → pool dữ liệu có bằng chứng → đối chiếu, duyệt và lưu lịch sử. Mục tiêu tiếp theo là ánh xạ pool sang REDCap và Word.

## Thành phần

- `ocr_pool/`: đọc bảng, chuẩn hóa kết quả và metadata, workflow có hash/resume.
- `form_pool/`: dữ liệu thu mẫu, checkbox, đọc lại ô nguồn và tích hợp specimen.
- `registry_pool/`: dictionary, schema, bundle có hash, SQLite importer và revisions.
- `registry_review/`: giao diện localhost, duyệt nguồn, xác nhận ca/lần ghi nhận, lịch sử và xuất JSON.
- `schemas/`: danh mục dự thảo 261 mục/377 component và JSON schemas.
- `tests/`, `examples/pool-tests/`: kiểm thử và ảnh/bảng hoàn toàn giả.

Mọi inference chạy tại máy với SenOCR-Vi và PP-DocLayoutV3. Các giá trị thiếu giữ nguyên; không tự suy điểm bệnh, gộp người hoặc thay PID/SID thành Study ID. Duyệt nguồn và chấp nhận kết quả cho ca/lần khám có phạm vi riêng.

## Kiểm thử

Python 3.11. Bộ kiểm thử không cần GPU, model hay hồ sơ thật; cần Pillow, NumPy và OpenCV headless:

```powershell
py -3.11 -m venv .venv-test
.\.venv-test\Scripts\python.exe -m pip install -r requirements-test.txt
.\.venv-test\Scripts\python.exe -X utf8 -m unittest discover -s tests
```

Môi trường OCR đang dùng tại máy phát triển là `.venv-senocr`; giữ nguyên torch/CUDA hiện có. `scripts/setup_senocr_local.ps1` yêu cầu môi trường có PyTorch/CUDA trước khi cài phần OCR và tải model. `scripts/setup_layout_local.py` tải model layout. Model và môi trường ảo không nằm trong Git.

## Chạy OCR và review

Xem [runbook OCR](OCR-POOL-RUNBOOK.md) để chạy từ manifest ảnh hoặc tiếp tục phần form từ clinical run đã lưu. Runner whole-image có 30 stage; resume chỉ hợp lệ khi inputs/code/schema/model/settings và artifact đã hoàn tất còn đúng hash.

Sau khi tạo bundle và nhập kho:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 -m registry_review.server --db LOCAL-REGISTRY.sqlite --bundle LOCAL-BUNDLE --port 8766
```

Mở `http://127.0.0.1:8766`. [Runbook duyệt](POOL-REVIEW-RUNBOOK.md) mô tả duyệt nguồn, liên kết ca/lần khám, rút quyết định và các dạng xuất JSON. Đây là bản thử một máy với vai trò khai báo, chưa có đăng nhập cho nhiều người dùng.

## Dữ liệu cục bộ và phạm vi triển khai

Repository chứa mã nguồn, schema, tài liệu và dữ liệu thử giả. Ảnh/hồ sơ thật, OCR/reference/pool/SQLite thật, backups, model, notebook có outputs và cấu hình tài khoản được giữ tại máy và loại khỏi Git. Các đường dẫn `research/` trong tài liệu là lịch sử chạy tại máy phát triển; chúng không được tải lên repository.

Hiện có duyệt nguồn cho observations/metadata/specimens và xuất pool JSON giữ đủ danh mục. Mapping REDCap/Word, sửa giá trị metadata/mẫu, liên kết mẫu/event chi tiết, bộ trích thuốc/lâm sàng và đánh giá trên hồ sơ mới còn tiếp tục phát triển. Xem [kế hoạch](POOL-DEVELOPMENT-PLAN.md). Báo cáo từng hồ sơ và bản bàn giao phiên làm việc được giữ tại máy cùng dữ liệu cục bộ.
