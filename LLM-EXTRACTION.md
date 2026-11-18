# Hợp đồng đầu ra khi đọc ảnh bằng API

`ocr_pool/llm_extraction.py` cung cấp schema, hướng dẫn trích xuất và chuẩn hóa có kiểm tra nguồn cho đầu ra LLM. Module này không gọi mạng, không đọc đáp án, không duyệt và không ghi database. Luồng import đã có lựa chọn Gemini API qua `ocr_pool/llm.py` và `ocr_pool/llm_workflow.py`; OCR tại máy là lựa chọn mặc định. Xem `LLM-API-INTAKE.md` để sử dụng trên UI.

Cập nhật 11/11, hợp đồng `llm-extraction-0.2`: mỗi dòng giữ tiêu đề nguồn `source_header`, `class_header`; chuẩn hóa vai trò chỉ từ tiêu đề nhận diện được, không từ tên assay hoặc giá trị. Có Class nhưng thiếu tiêu đề Class bị yêu cầu duyệt. Đây vẫn là bằng chứng model tự đọc, chưa phải bộ kiểm tiêu đề ảnh độc lập. Dữ liệu cũ thiếu hai thuộc tính này vẫn đọc được.

PFT giữ số đo cùng phần trăm dự đoán trên một dòng cho từng lần Pre/Post; hỗ trợ cả `pre_percent_predicted` và `post_percent_predicted`. Adapter không emit phần trăm lần hai khi component chính đã là phần trăm. Các occurrences có evidence khác nhau được giữ riêng dù số giống nhau. Mâu thuẫn số với raw, cột với header hoặc class không có nguồn được ưu tiên duyệt thấp; không tự sửa số hay autoaccept. Grade chữ in và viết tay dùng cùng quy tắc liên hệ ô; `writing_style` được giữ riêng với mức chắc chắn về quan hệ.

Transport mới lưu JSON HTTP phản hồi, prompt/schema đã lắp ghép, hash bytes ảnh và finish reason trong artifact local. Không lưu khóa trong request contract. Adapter giữ vai trò/tiêu đề nguồn và cảnh báo; manifest transform đầy đủ có thể được gắn vào evidence cho các lượt crop/mask bằng runner riêng. Các artifact này có nội dung nguồn và phải giữ ở kho local như raw OCR.

Exporter tính lại content ID sau khi gộp bản ghi trùng, trước khi dựng field refs; kiểm thử có nhập và nhập lặp vào SQLite tạm, không chỉ verify bundle. Không thay ID hoặc viết lại bundle lịch sử.

`ocr_pool/llm_verification.py` hỗ trợ tối đa một lượt kiểm ảnh bổ sung cho các dòng có mâu thuẫn số/cột/Class hoặc grade mơ hồ. Chỉ gửi nhãn nguồn của dòng bị cờ, không gửi đáp án tham chiếu. Chỉ ghép khi nhãn nguồn là duy nhất và phản hồi khớp đúng bộ nhãn; chỉ các thuộc tính liên quan đến cờ được phép thay đổi. Lỗi API, nhãn lặp hoặc quan hệ vẫn mơ hồ giữ bản nháp để người dùng duyệt. JSON đầu giữ nguyên; audit và phản hồi kiểm lại được giữ cùng bằng chứng trong bundle. Dữ liệu CBC có tiêu đề Result chung vẫn giữ component số lượng tuyệt đối/phần trăm theo vai trò đã trích, không ép về result.

Thử nghiệm 11/11: 9 ảnh phát triển gọi mới Luna, thêm 3 trang giả mới; cùng reference/scorer cũ. Số xét nghiệm 178/178, strict 143/167 sau kiểm lại có giới hạn, nhưng field_id CRF giảm từ 130/131 xuống 125/131; còn nhầm panel/phương pháp và ký hiệu o/0 ở một trang. Cả bộ phát triển và bộ giả nhập/nhập lặp được vào SQLite riêng, tất cả pending. Đây là kiểm tính nhập được, không xác nhận nội dung đúng hay khả năng áp dụng cho bệnh nhân mới. Báo cáo tại `research/luna-generic-rerun-20261111-01/REPORT.md`.

## Các ràng buộc

- Field ID thuộc dictionary; component thuộc danh mục hoặc vai trò đo ngoài CRF. Comparator chỉ có `=`, `<`, `>`, `<=`, `>=` hoặc null cho kết quả không có số. Schema dùng nhánh nullable độc lập để tương thích bộ chuyển schema của gateway.
- Chuẩn hóa khoảng trắng và dấu Unicode. Comparator lỗi chỉ được khôi phục nếu bộ phân tích đọc được giá trị từ `raw_result` của chính dòng đó và số khớp. Comparator hợp lệ nhưng mâu thuẫn với nguồn bị đánh dấu cần duyệt. Không mặc định mọi ký tự lạ là dấu bằng.
- Mỗi dòng có `table_kind` và `source_column`. Vai trò Pre/Post độc lập với việc có thuộc CRF hay không. Chỉ chuẩn hóa component PFT khi có cột nguồn rõ; không suy từ giá trị số hoặc từ riêng sự hiện diện của `%Pre`.
- `grade_annotation` giữ chữ viết tay, vị trí và quan hệ với kết quả. Chỉ đưa vào `grade_raw` khi được xác định nằm trong ô kết quả và liên hệ rõ. Chú thích chồng dòng hoặc mơ hồ được giữ cùng cờ cần duyệt. Không tìm dấu cộng trong notes rồi tự gán vào ANA; không đổi grade thành titre.
- Mỗi lần chuẩn hóa có audit trước/sau/lý do. Raw response và raw extraction giữ riêng. `validation_issues` là các việc còn phải duyệt; không tự chấp nhận các ứng viên.

## Kiểm tra

### Thử quy tắc kết quả định tính từ SQLite

`schemas/result-literals.sql` tạo bảng quy tắc có phiên bản cho ký hiệu hoặc từ khóa nguyên ô. Runner API nhận database qua `--result-rules PATH`. Quy tắc chỉ sao chép giá trị nguyên văn sang trường định tính trống khi tiêu đề, vai trò cột và component đều xác định ô **Kết quả**. Các cột **Class**, giá trị số và grade được xử lý theo logic nguồn tương ứng. Mỗi lần sao chép ghi phiên bản và từ khóa vào audit và bằng chứng bundle, kết quả vẫn chờ người dùng duyệt. Tùy chọn này chạy cục bộ sau khi nhận JSON.

```powershell
python -X utf8 -m unittest discover -s tests -p test_llm_extraction.py -v
python -X utf8 -m unittest discover -s tests -p test_generic_lab_repairs.py -v
python -X utf8 -m unittest discover -s tests -p test_llm_contract_generic.py -v
```

Kiểm thử dùng giá trị mới, dấu bất đẳng thức, số thập phân mơ hồ, cột Pre/Post trong/ngoài CRF và các vị trí chú thích khác nhau. Không lấy đáp án của bộ ảnh làm quy tắc.

## Lượt kiểm chứng API

Runner cục bộ `research/gemini-direct-trial-20261110-01/run_env_image_trial_v2.py` dùng base URL, model và khóa đọc từ `.env`. Chỉ gửi ảnh có trong manifest khử định danh đã được xem, đúng thư mục và đúng SHA-256 đã khóa. Không gửi ảnh mới/chưa kiểm tra chỉ vì xuất hiện trong thư mục inputs.

Lượt cũ và lượt sửa được lưu ở hai thư mục riêng. Các request dùng cùng bộ ảnh và cùng đáp án đã khóa. Bộ đánh giá vẫn là tự đối chiếu phát triển, chưa phải xác nhận lâm sàng hoặc kiểm thử trên dữ liệu độc lập. Không tự đưa kết quả API lên UI hay thay thế dữ liệu đã duyệt.
