# Trạng thái dự án · 14/11/2026

Bản ngắn, chỉ trạng thái hiện tại. Lịch sử chi tiết nằm trong `SESSION-HANDOFF.md` (chỉ lưu local, không có trong Git). Hướng dẫn chạy đầy đủ: `DEVELOPMENT.md`.

## Mục tiêu
Registry lupus (SLE) có bác sĩ duyệt: ảnh hồ sơ của một bệnh nhân → OCR local tìm định danh → tự cắt/che → trích xuất (OCR local hoặc API LLM với ảnh đã che) → ứng viên có nguồn, chờ duyệt → duyệt theo bố cục CRF (261 mục / 377 thành phần) → xuất Word theo mẫu gốc / REDCap.

## Thư mục
- `ocr_pool/` OCR, cắt/che, gọi API, luồng nhanh xét nghiệm/hô hấp ký
- `form_pool/` phiếu thu mẫu, specimen
- `registry_pool/` dictionary, bundle bất biến, SQLite importer, revisions
- `registry_review/` server localhost + UI duyệt, intake ảnh, CRF, knowledge base chấm điểm
- `registry_export/` xuất Word, REDCap, ledger
- `schemas/`, `scripts/`, `tests/`

## Kiểm thử
```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 -m unittest discover -s tests
node tests/review_intake_ui_smoke.cjs   # và các *_smoke.cjs khác
```

## Trạng thái
- **Pilot Ubuntu** (`privacy-proposal-0.19`): web + tunnel chạy bằng `systemctl --user`, API dùng luồng nhanh cho xét nghiệm và hô hấp ký. Một hồ sơ thử mới đã chạy xong; dữ liệu còn chờ duyệt, tổng EULAR/ACR và SLEDAI-2K còn thiếu dữ kiện.
- **Word**: bản thử cho một hồ sơ đã render khớp mẫu 15 trang. Exporter tổng quát vẫn còn nhiều mục chưa có ô tương ứng (đưa vào phụ lục).
- **REDCap**: project demo (Development) đã tạo nhưng trống, chưa import dictionary. Schema local hiện là mô hình pool 5 form (71 biến), chưa phải biểu mẫu từng câu hỏi theo CRF. Chưa có máy chủ REDCap lâu dài.
- **Độ chính xác**: mọi điểm số là tự chấm trên bộ phát triển, chưa có holdout chấm độc lập.

## Việc tiếp theo
1. Xác minh máy chủ REDCap chính thức của đơn vị; chốt đầu ra chính (Word hay REDCap).
2. Chốt một luồng trích xuất chính (một model, một cấu hình server).
3. Lập bộ hồ sơ holdout được chấm độc lập.
4. Thêm đăng nhập/phân quyền và siết mạng trước khi pilot rộng.

## Nguyên tắc
- Sửa tổng quát cho tài liệu mới, không hardcode ảnh/giá trị; không sửa bộ chấm để che lỗi.
- Không tự duyệt, không bịa giá trị, không suy điểm lâm sàng; "thiếu dữ kiện" khác "Không".
- Không gửi ảnh chưa che hoặc dữ liệu bệnh nhân ra ngoài; không commit secret, ảnh, SQLite, `research/`, `outputs/`.
