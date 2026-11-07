# Hợp đồng đầu ra OCR → pool dữ liệu lupus

Cập nhật 05/11/2026 theo xác nhận của người dùng. Đây là thiết kế đề xuất, chưa phải schema máy đã hoàn thiện hoặc pipeline đã chạy.

Phương án triển khai từ output OCR/bảng sang pool: [layout + SenOCR-Vi + parser nghiệp vụ + đối chiếu](./OCR-TO-POOL-IMPLEMENTATION.md), dựa trên kết quả notebook người dùng cung cấp.

## Bản triển khai thử 0.2 — 06/11/2026

Đã có pool ứng viên chạy được, xem [kết quả metadata](OCR-METADATA-RESULTS.md). Những yêu cầu đầy đủ ở dưới vẫn là hợp đồng mục tiêu; chưa coi mọi yêu cầu nhập kho/phiên bản/lịch sử duyệt đã triển khai.

- `schema_version=lupus-candidate-pool-0.2`: bổ sung `metadata_candidates` với `candidate_id`, `document_id`, `key`, `value`, `value_raw`, `label_raw`, `flags`, `evidence_ids` và trạng thái duyệt. PID/SID là chuỗi, giữ số 0 đầu; không dùng làm Study ID hoặc tự gộp người.
- `birth_date`, `sample_date`, `received_date`, `ordered_date`, `measurement_date`, `distributed_date` tách riêng. Chỉ chuẩn hóa DMY khi nguồn đã khai báo; timestamp không nhãn cần vai trò nguồn được khai báo rõ. Không suy ngày từ SID/ngày sinh/ngày nhận mẫu. ISO datetime chưa có timezone nghĩa là nguồn chưa nêu múi giờ.
- Quan sát dùng `source_date`, `date_type`, `date_evidence_ids`. Ngày trích từ metadata chỉ truyền tới quan sát cùng tài liệu/ảnh; mâu thuẫn chặn truyền tự động. Giữ `case_id=null`, `identity_status=unconfirmed` cho bộ phát triển.
- ADM chỉ nhận tuổi, giới, chiều cao/cm và cân nặng/kg in trực tiếp vào `ADM02`, `ADM03`, `ADM05`, `ADM06`. Không tính tuổi/BMI hoặc suy trường lâm sàng. Thiếu ứng viên ADM giữ `not_processed`.
- Evidence metadata có `evidence_kind=metadata`, dòng raw, nhãn, span ký tự, hash raw/hash ảnh và vùng crop. Chỉ có tọa độ vùng, không giả vờ có bbox từng chữ. Trong SQLite `result_column` có thể NULL cho văn bản; bảng `metadata_candidates`/`metadata_evidence` giữ liên kết riêng.
- IDs hiện có phạm vi từng gói/lượt chạy; không coi việc ghép lại là idempotent ingestion của kho chính thức. Mọi ứng viên vẫn `pending`, không đủ điều kiện vào pool đã xác minh.

## 1. Mục tiêu và ranh giới

**Phần OCR tạo pool dữ liệu có cấu trúc với các trường nghiệp vụ lấy từ Word lupus. Hệ thống lưu trữ phía sau tiếp nhận pool, quản lý dữ liệu và có thể xuất Word.**

```text
Word đã lọc lupus → từ điển trường nghiệp vụ có phiên bản
                                  ↓
Ảnh/PDF → OCR thô → trích/chuẩn hóa → pool dữ liệu có nguồn
                                  ↓
                    hệ thống lưu trữ phía sau
                                  ↓
                  truy vấn / báo cáo / xuất Word
```

Word quy định cần thu thông tin gì; không quy định khóa lưu dữ liệu theo địa chỉ ô. Bộ xuất Word quản lý liên kết trường–vị trí hiển thị riêng. Đổi bố cục mẫu không được buộc chạy lại OCR hoặc đổi ID trường nếu nghĩa dữ liệu giữ nguyên.

Đọc chữ bằng model chưa đủ tạo pool: cần tách số/đơn vị/ngày, nhận đúng hàng/cột/panel, phân loại vào khái niệm nghiệp vụ và giữ bằng chứng. Đây là phân loại ngữ nghĩa, không phải điền ô Word.

## 2. Các lớp dữ liệu

| Lớp | Cần lưu | Mục đích |
| --- | --- | --- |
| Nguồn | File gốc, mã tài liệu, hash, trang, metadata tiếp nhận | Truy nguồn và xác nhận tài liệu |
| OCR thô | Output nguyên bản, cấu trúc bảng/vùng nếu có, model/revision/cấu hình | Kiểm lỗi đọc, có thể trích lại mà không chạy OCR lại |
| Quan sát/ứng viên | Tên và giá trị nguồn, số/định tính, dấu, đơn vị, thời gian, panel/phương pháp/loại mẫu, bằng chứng | Giữ nội dung đã trích trước và sau chuẩn hóa |
| Pool theo trường | Mã nghiệp vụ, liên kết các quan sát, trạng thái và đối chiếu | Đầu ra phục vụ hệ thống lưu trữ |

Pool là mô hình dữ liệu bàn giao, không bắt buộc phải là một bảng rộng hoặc một file cho toàn bộ bệnh nhân. JSON là định dạng bàn giao ban đầu; hệ thống phía sau có thể nhập vào PostgreSQL hoặc cấu trúc lưu trữ phù hợp.

## 3. Nội dung gói bàn giao

| Nhóm | Thuộc tính tối thiểu cần thiết kế |
| --- | --- |
| Gói | `package_id`, `package_revision`, `schema_version`, `dictionary_version`, thời điểm tạo, phiên bản pipeline |
| Ca/người | Mã ca nội bộ; mã người nếu đã xác nhận; `identity_status`. Chưa xác nhận thì không tự liên kết người |
| Tài liệu | `document_id`, hash, loại file, khóa nguồn nội bộ, danh sách trang; metadata ngày/cơ sở nếu đọc được |
| Lần xử lý | `run_id`, model/checkpoint hash, cấu hình, phiên bản parser, `processing_status`, lỗi và phạm vi đã xử lý |
| Quan sát | `observation_id`, `field_id` khi phân loại chắc chắn, tên/giá trị gốc, kiểu, số/định tính, dấu so sánh, đơn vị gốc/chuẩn hóa, ngày và loại ngày, panel/phương pháp/loại mẫu nếu có |
| Theo trường | `field_id`, thuộc tính con/lựa chọn, danh sách `observation_ids`, trạng thái trích xuất và lý do |
| Bằng chứng | `evidence_id`, tài liệu, trang, trích dẫn, vùng và độ chi tiết nếu có; phép đổi tọa độ khi xử lý ảnh |
| Đối chiếu | Trạng thái duyệt, người/thời điểm, sửa trước/sau, lý do và liên kết phiên bản |
| Manifest | Danh sách file cần chuyển nội bộ, hash, quan hệ tài liệu–OCR–bằng chứng |

Các nhóm này là yêu cầu logic, chưa khóa thành tên bảng vật lý. Mã ca không tự thay thế Study ID. Metadata vận hành không phải trường lâm sàng được bổ sung vào mẫu lupus.

## 4. Biểu diễn nhiều kết quả và trường thiếu

- Một trường có thể có nhiều quan sát ở các thời điểm khác nhau. Không ghi đè bằng giá trị mới nhất và không coi khác ngày là mâu thuẫn.
- Một mục trong Word có thể gồm nhiều thuộc tính: Yes/No và mô tả; kết quả và đơn vị; giá trị đo và % dự đoán. Cần biểu diễn đầy đủ theo nghĩa nghiệp vụ.
- Danh mục hiện có 261 mã là đầu vào kiểm kê, chưa phải 261 trường nguyên tử hoàn chỉnh. Tiếp tục rà thuộc tính con, nhóm lặp và quan hệ từ 20 bảng lẫn nội dung ngoài bảng.
- Số lưu bằng chuỗi thập phân/Decimal khi xử lý; giữ `raw`, dấu so sánh và đơn vị gốc. Không đổi đơn vị khi chưa có quy tắc xác nhận.
- Mọi trường được liệt kê với quan sát hoặc trạng thái. `not_found` chỉ áp dụng cho tập nguồn/phạm vi đã xử lý thành công của gói; không khẳng định bệnh nhân chưa từng có dữ liệu đó.
- Khi trang chưa xử lý hoặc job lỗi, dùng `not_processed`/`processing_failed` hoặc trạng thái tương đương đã chốt; không đổi thành `not_found`.
- `unreadable`, `conflict`, `ambiguous_mapping`, `requires_clinical_assessment`, `not_computed` được giữ riêng. Chưa có thông tin không đồng nghĩa No/âm tính.
- Trạng thái trích xuất và trạng thái đối chiếu độc lập. Dữ liệu chưa duyệt được bàn giao chỉ khi giữ nguyên cờ, không tự chuyển thành đã xác minh.

## 5. Ví dụ dữ liệu giả

Ví dụ chỉ minh họa quan hệ trường–quan sát–nguồn, đã rút gọn metadata và không phải output thô của model. Hai kết quả dưới đây cùng thuộc một trường nhưng khác ngày; pool giữ cả hai.

```json
{
  "package_id": "DEMO-PKG-001",
  "package_revision": 1,
  "schema_version": "draft-1",
  "dictionary_version": "draft-1",
  "case_id": "DEMO-CASE-001",
  "identity_status": "unconfirmed",
  "documents": [
    {"document_id": "DEMO-DOC-01", "source_key": "demo/lab-01.jpg"},
    {"document_id": "DEMO-DOC-02", "source_key": "demo/lab-02.jpg"}
  ],
  "fields": {
    "DEMO_COMPLEMENT_C3": {
      "extraction_status": "found",
      "observation_ids": ["DEMO-OBS-01", "DEMO-OBS-02"]
    }
  },
  "observations": [
    {
      "observation_id": "DEMO-OBS-01",
      "field_id": "DEMO_COMPLEMENT_C3",
      "name_raw": "C3",
      "result_raw": "0.65",
      "result_type": "numeric",
      "numeric_value": "0.65",
      "comparator": "=",
      "unit_raw": "g/L",
      "date": "2026-08-13",
      "date_type": "reported_result_date",
      "evidence_ids": ["DEMO-EV-01"],
      "review_status": "pending"
    },
    {
      "observation_id": "DEMO-OBS-02",
      "field_id": "DEMO_COMPLEMENT_C3",
      "name_raw": "C3",
      "result_raw": "0.80",
      "result_type": "numeric",
      "numeric_value": "0.80",
      "comparator": "=",
      "unit_raw": "g/L",
      "date": "2026-09-13",
      "date_type": "reported_result_date",
      "evidence_ids": ["DEMO-EV-02"],
      "review_status": "pending"
    }
  ],
  "evidence": [
    {
      "evidence_id": "DEMO-EV-01",
      "document_id": "DEMO-DOC-01",
      "page": 1,
      "quote": "C3 0.65 g/L",
      "region": null,
      "region_granularity": "unavailable"
    },
    {
      "evidence_id": "DEMO-EV-02",
      "document_id": "DEMO-DOC-02",
      "page": 1,
      "quote": "C3 0.80 g/L",
      "region": null,
      "region_granularity": "unavailable"
    }
  ]
}
```

`DEMO_COMPLEMENT_C3` là mã minh họa, không thay danh mục mã hiện có. Không tạo bbox hoặc confidence khi engine chưa cung cấp/đo được. Bbox cả bảng không được gắn nhãn là bbox từng kết quả.

## 6. Quy tắc tiếp nhận của hệ thống lưu trữ

1. Kiểm phiên bản schema/từ điển, kiểu và liên kết ID; từ chối hoặc cách ly gói không hợp lệ kèm lỗi cụ thể.
2. Nhập lại cùng `package_id` và revision không tạo thêm bản ghi; cùng ID/revision mà nội dung khác phải báo lỗi. Revision mới và run mới được giữ theo lịch sử, không ghi đè bản đã duyệt.
3. Mã quan sát do pipeline quản lý ổn định và có liên kết thay thế phiên bản; không chỉ ghép tên xét nghiệm + ngày để loại trùng vì một ngày có thể có nhiều mẫu/lần làm.
4. Phân biệt trùng ảnh, cùng phiếu và cùng quan sát. Không tự gộp người hoặc kết quả khi thiếu căn cứ.
5. Chuyển file nguồn/bằng chứng theo manifest nội bộ và đối chiếu hash; không phụ thuộc đường dẫn tuyệt đối trên máy phát triển.
6. Khi xuất Word, hệ thống phía sau chọn ca/mốc/quan sát theo quy tắc riêng; việc lựa chọn đó không xóa các quan sát khác trong pool.

## 7. Nghiệm thu phần OCR

Đánh giá khả năng thu đủ và đúng dữ liệu có trong ảnh, đúng quan hệ tên–giá trị–đơn vị–panel–ngày, đủ schema nghiệp vụ, bằng chứng, trạng thái và import lặp. Không nghiệm thu phần OCR bằng việc tạo DOCX hoặc giữ bố cục trang Word.

Chưa có schema production, importer, cơ sở dữ liệu vận hành hoặc benchmark tự động trong lần cập nhật tài liệu này. [JSON đọc trực quan trước đây](./examples/derived/crf-example-001.json) là bản nháp tham khảo; cần chuyển sang hợp đồng đã chốt khi triển khai, không coi là pool đã sẵn sàng nhập.
