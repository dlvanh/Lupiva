# Mức tin cậy và giảm khối lượng duyệt

Mỗi ứng viên trong `/api/patient` và bản tải JSON có `confidence`: điểm 0–100 theo quy tắc, mức high/medium/low, lý do, nguồn tín hiệu OCR và cờ chặn. Đây là điểm xếp thứ tự kiểm tra, không phải xác suất đọc đúng. Giá trị bất thường, cờ H/L và xét nghiệm không thuộc CRF không bị hạ điểm chỉ vì các đặc điểm đó.

## Sử dụng

- Mở hồ sơ, chọn **Xem trường nghi ngờ** để ưu tiên giá trị low/medium.
- Chọn **Xem nhóm ít cảnh báo** để xem và chọn các kết quả high cho một đợt duyệt. Đây là các ứng viên ít cảnh báo, chưa phải nhóm được chứng minh đủ điều kiện tự tiếp nhận.
- Xem **Vì sao có mức này?** dưới mỗi kết quả. Ngày/loại mẫu/đơn vị mâu thuẫn, parse thất bại, định danh giữa ảnh không thống nhất hoặc đề xuất sửa chưa quyết định được ưu tiên xem lại.
- Dấu gạch trống trên nguồn nằm ở bộ lọc riêng; không biến thành số 0 hoặc kết quả âm tính.
- Đổi bộ lọc giữ lựa chọn rõ ràng trước đó, hiển thị số mục đã chọn ngoài bộ lọc và bỏ xác nhận duyệt cũ. Không có thao tác duyệt tự động.
- Các dòng/vùng chưa trích xuất vẫn hiện ở mục cảnh báo vùng nguồn. Điểm cao cho giá trị đã đọc không chứng minh tài liệu đã được đọc đủ.

## Tín hiệu OCR

`scripts/recognize_regions.py` ghi `ocr_confidence` cho từng vùng: số token, mean log-probability, geometric mean/p10 token probability, tỷ lệ token có xác suất thấp và chênh lệch top-2. Thu hai số và token lựa chọn mỗi bước, không giữ ma trận logits toàn từ vựng; không đổi logits hoặc decoding greedy. Tín hiệu đi theo bằng chứng nguồn vào các ứng viên bảng/metadata/bổ sung.

Tín hiệu này thuộc cả vùng, chưa định vị độ chắc chắn của từng ô. Xác suất token không phải xác suất xét nghiệm được trích xuất đúng. Các lượt OCR cũ thiếu tín hiệu vẫn ghi rõ unavailable, không tự điền số. Trường `probability_correct` là null và `calibrated` là false.

## Theo dõi và điều kiện cho tự tiếp nhận

`confidence_summary` đếm mức ưu tiên, nhóm ít cảnh báo và gạch trống. `confidence_feedback` đếm số giá trị được người duyệt chấp nhận kèm/không kèm sửa. Tỷ lệ sửa trong hàng đợi được chọn có thiên lệch; không coi đó là tỷ lệ sai của toàn bộ dữ liệu.

Ứng viên còn lưu `extraction_score`, `extraction_tier`, `extraction_blockers` tính từ dữ liệu OCR gốc, trước khi quan sát kết quả sửa/loại. Không dùng giá trị đã được người sửa làm đầu ra thành công của máy.

Có công cụ đánh giá offline:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/evaluate_review_confidence.py --dataset <human-audit.json> --output <fresh-report.json> --max-group-error 0.01
```

JSON đầu vào gồm:

```json
{
  "confidence_version": "source-review-priority-1",
  "extraction_fingerprint": "hash-of-code-model-and-settings",
  "samples": [
    {
      "sample_id": "unique-candidate-id",
      "patient_group": "patient-group-id",
      "partition": "calibration",
      "score": 90,
      "blockers": [],
      "placeholder": false,
      "correct": true,
      "human_verified": true,
      "reviewer": "Tên người đã đối chiếu",
      "sampling_strategy": "random_audit"
    }
  ]
}
```

Đây là mô tả schema, không phải mẫu đã được xác nhận đúng. Chỉ điền nhãn sau khi người duyệt đối chiếu nguồn. Chia calibration/validation theo bệnh nhân, không cho cùng bệnh nhân xuất hiện ở cả hai phần. Nhóm validation lấy ngẫu nhiên, không chỉ lấy các dòng bị gắn cờ. Dùng điểm trích xuất gốc, không dùng điểm của giá trị đã sửa.

Công cụ chọn ngưỡng trên calibration, rồi đánh giá nguyên ngưỡng trên validation tách biệt. Báo cáo hai kết quả: tỷ lệ được đưa vào nhóm đề xuất tự tiếp nhận và lỗi quan sát trong nhóm đó; thêm cận trên một phía của tỷ lệ bệnh nhân có ít nhất một lỗi. Mặc định mục tiêu cận trên 1% với mức tin cậy 95%; đây là cấu hình đánh giá, chưa phải kết quả đã đạt hoặc ngưỡng người dùng đã xác nhận. Phép ước lượng giả định các nhóm bệnh nhân độc lập, đại diện cho dữ liệu sử dụng. Nhiều dòng của một bệnh nhân không được coi là nhiều bệnh nhân độc lập.

Báo cáo không gán xác suất cho từng trường, không sửa dữ liệu, không bật tự duyệt hoặc thay đổi xuất Word/REDCap. Hiện chưa có validation độc lập đạt mục tiêu, nên `auto_accept_enabled=false`. Bộ BN3 được dùng sửa quy tắc không được dùng để tuyên bố ngưỡng này đã được kiểm chứng. Không có Langfuse cloud, upload hoặc nhãn giả được tạo để lấp chỗ trống.

## Kiểm chứng lần triển khai

Kết quả kỹ thuật, thống kê BN3, fingerprint code và kiểm tra toàn bộ bảng SQLite được lưu trong `research/confidence-triage-20261109-01/`. Thử một vùng OCR thật cho raw text và 35 token giữ nguyên; peak GPU tăng khoảng 0,22 MiB. Đây là smoke test một vùng, không phải benchmark toàn luồng hoặc đo độ chính xác mới.
