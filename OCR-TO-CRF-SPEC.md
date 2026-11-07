# Đặc tả OCR hồ sơ → pool dữ liệu lupus

Cập nhật 05/11/2026 theo xác nhận lại của người dùng. Phạm vi hiện tại: đọc hồ sơ và tạo pool dữ liệu có cấu trúc, bộ trường dựa trên Word; kế hoạch thực hiện 6 tuần. Hệ thống lưu trữ phía sau tiếp nhận pool và có thể tạo Word. Xuất DOCX không phải đầu ra của phần OCR.

**Yêu cầu bảo mật đã xác nhận:** xử lý trên server nội bộ có GPU NVIDIA. Dùng model OCR chạy local; không đưa hồ sơ lên dịch vụ OCR/AI cloud. [Đề xuất kỹ thuật triển khai nội bộ](./OCR-TECHNICAL-PROPOSAL.md) là phương án hiện hành.

Lựa chọn model được cập nhật tại [nghiên cứu OCR mới](./OCR-MODEL-RESEARCH.md): benchmark PaddleOCR-VL-1.6, MonkeyOCRv2-B-Parsing và nhánh tiếng Việt trước khi chốt engine; không khóa ở PP-OCRv5 hoặc tự chọn phiên bản mới nhất.

## 1. Chuẩn đầu ra đã xác nhận

**File Word đã được lọc bỏ các phần không thuộc lupus, vì vậy Word là tài liệu chuẩn để xác định bộ trường nghiệp vụ của pool.** Dùng [file Word gốc](./260825_Vivi_MDDU_CRF_SLE_AI%20thực%20chiến.docx), không thêm lại các phần ngoài lupus từ ảnh output. Vị trí ô, số trang và bố cục Word không phải khóa dữ liệu của pool.

Luồng cần triển khai: **Ảnh hồ sơ → OCR → trích và chuẩn hóa → phân loại vào bộ trường nghiệp vụ → pool dữ liệu có nguồn → bàn giao cho hệ thống lưu trữ.** Hệ thống lưu trữ có bộ xuất Word riêng ở giai đoạn tích hợp. Xem [hợp đồng bàn giao pool](./OCR-DATA-POOL-CONTRACT.md).

- `examples/inputs`: nguồn để lấy giá trị; hiện có 12 ảnh.
- `examples/outputs`: 28 ảnh tham khảo cách ghi và trình bày. Chỉ tham khảo phần có trong Word; không dùng làm nguồn bổ sung giá trị thiếu trong input.
- Đầu ra chính: gói JSON có phiên bản schema, toàn bộ trường nghiệp vụ, các quan sát theo thời gian, bằng chứng và trạng thái; sẵn sàng nhập vào hệ thống lưu trữ.
- Giữ riêng OCR thô để kiểm tra, ứng viên trích xuất và dữ liệu đã đối chiếu. Hệ thống phía sau quyết định lưu trữ và trình bày/xuất Word từ dữ liệu này.

“Đủ trường” nghĩa là pool biểu diễn được mọi trường và thuộc tính con theo Word, thu mọi giá trị có bằng chứng trong input. Nếu input không có thông tin thì ghi trạng thái thiếu; nếu khó đọc thì đánh dấu cần kiểm tra. Không tự chọn No/âm tính, tạo bệnh sử hoặc chép giá trị từ ảnh output.

Hiện tại tập trung OCR → pool và hợp đồng nhập dữ liệu. Hệ thống lưu trữ đầy đủ, xuất Word, dashboard, tích hợp HIS/LIS và phân tích điều trị là phần phát triển phía sau.

## 2. Toàn bộ trường cần hỗ trợ

[Danh mục trường](./schemas/crf-template-fields.json) hiện có **261 mã mục/tiêu chí** từ bản phân tích; [kiểm kê Word](./schemas/crf-word-structure.json) ghi nhận **20 bảng**, đoạn văn và địa chỉ ô.

261 là số mục trong danh mục, không phải số trường nguyên tử đã chốt. Một mục có thể chứa nhiều lựa chọn, thuộc tính chi tiết hoặc giá trị lặp. Phải tách rõ kiểu dữ liệu, thuộc tính con và quan hệ lặp; đủ 261 mã JSON chưa chứng minh đủ schema nghiệp vụ.

| Nhóm | Phạm vi theo Word |
| --- | --- |
| Thông tin nền | Study ID, tuổi, giới, ngày ICF, chiều cao, cân nặng, BMI, bác sĩ, điều dưỡng. |
| Tiền sử | Thai kỳ/beta-hCG, bệnh đồng mắc, gia đình, sốt, nhiễm trùng và phần mô tả. |
| Điều trị | Thuốc, liều, thời gian, tiêm chủng và các lựa chọn tương ứng trong mẫu. |
| Cơ quan | Toàn bộ biểu hiện và thăm dò được giữ lại trong Word lupus. |
| Xét nghiệm | Huyết học, sinh hóa, thận/nước tiểu, miễn dịch, các panel và từng thành phần có trong Word. |
| Chức năng hô hấp | Từng chỉ số, giá trị đo và % dự đoán khi nguồn có; giữ đúng các vị trí của Word. |
| Phân loại và hoạt động bệnh | Các lựa chọn/điểm EULAR/ACR, SLEDAI-2K được ghi trong nguồn. Chưa tự đánh giá hoặc tính điểm trong phạm vi OCR. |

Những xét nghiệm được giữ trong Word vẫn thuộc phạm vi dù cũng xuất hiện ở hồ sơ bệnh tự miễn khác. Không tự loại thêm trường theo tên bệnh; không tự mở rộng danh mục từ ảnh output.

Mỗi trường cần `field_id` ổn định, định nghĩa, kiểu dữ liệu, thuộc tính con, lựa chọn cho phép, điều kiện áp dụng và tính lặp. Ví dụ mục Yes/No có lựa chọn và phần mô tả; xét nghiệm có kết quả, đơn vị, ngày và panel. Phải kiểm cả nội dung ngoài bảng. Địa chỉ Word chỉ lưu như tham chiếu nguồn của định nghĩa trường, không bắt buộc có `slot_id` hoặc địa chỉ ô trong bản ghi OCR.

Địa chỉ `Bxx.Rx.Cx` trong kiểm kê là vị trí logic OOXML, không phải số trang. Giữ SHA256 Word làm nguồn gốc phiên bản từ điển. Bộ xuất Word phía sau sẽ quản lý liên kết trường–ô cho từng phiên bản mẫu; OCR không phụ thuộc liên kết đó.

## 3. Quy ước đầu ra dữ liệu

Mỗi trường luôn có mặt, kể cả khi chưa có giá trị:

```json
{
  "field_id": "REN05",
  "status": "found",
  "values": [{
    "raw": "Creatinin: 50.6 µmol/L",
    "numeric_value": "50.6",
    "comparator": "=",
    "unit_raw": "µmol/L",
    "source_date": "2026-08-13"
  }],
  "evidence": [{
    "source_id": "IN01",
    "page_in_image": 1,
    "quote": "Creatinin 50.6 µmol/L",
    "region": null
  }]
}
```

Ví dụ minh họa trên được rút gọn. [JSON mẫu hiện có](./examples/derived/crf-example-001.json) là bản nháp đọc trực quan, tổ chức các mục trong `fields`, có `label`, `selected_value`, `reason` và đường dẫn ảnh thật; chưa phải hợp đồng import đã hoàn thiện. Pool giữ mọi quan sát/ứng viên, không ép chọn một giá trị duy nhất cho biểu mẫu. Trường `selected_value` của bản nháp không được dùng để loại bỏ quan sát khác ngày. Hợp đồng mới tách quan sát, bằng chứng và liên kết trường trong [đặc tả pool](./OCR-DATA-POOL-CONTRACT.md).

Số lưu dạng chuỗi thập phân để bảo toàn cách ghi; dấu `<`/`>` tách riêng. Giữ giá trị và đơn vị gốc bên cạnh bản chuẩn hóa. Nhiều thời điểm phải giữ thành các quan sát riêng, không tự chọn mới nhất nếu chưa biết mốc cần điền.

| Trạng thái | Ý nghĩa trong pool |
| --- | --- |
| `found` | Có bằng chứng và xác định được trường nghiệp vụ. Vẫn có thể đang chờ người đối chiếu. |
| `not_found` | Ghi “Không có thông tin trong nguồn”; không chuyển thành No/âm tính. |
| `unreadable` | Ghi “Không đọc rõ”; chỉ ra ảnh cần kiểm tra. |
| `conflict` | Giữ các giá trị mâu thuẫn, ghi “Cần đối chiếu”. |
| `ambiguous_mapping` | Đọc được nhưng chưa rõ trường/thuộc tính nghiệp vụ; giữ ứng viên, chưa xác nhận phân loại. |
| `not_applicable` | Chỉ dùng khi có căn cứ rõ cho điều kiện không áp dụng. |
| `requires_clinical_assessment` | Ghi “Chưa có đánh giá trong nguồn”; không tự đánh giá. |
| `not_computed` | Chưa có giá trị ghi sẵn và chưa thực hiện tính toán. |
| `not_processed` / `processing_failed` | Chưa xử lý xong hoặc xử lý lỗi các nguồn liên quan; không được coi là không có dữ liệu. |

Trạng thái trích xuất tách khỏi trạng thái kiểm chứng. Mỗi quan sát trong engine cần bằng chứng riêng: file, trang, vùng/trích dẫn, ngày và loại ngày, panel/phương pháp nếu có. Confidence không thay thế nguồn. Bản đọc trực quan hiện không có confidence hoặc bbox đo được, nên để null thay vì tạo số.

## 4. Công cụ và các thuật toán xử lý

| Bước | Công cụ đề xuất | Cách xử lý |
| --- | --- | --- |
| Tiếp nhận | Python, SHA256; lưu local cho bản thử | Giữ file gốc, mã tài liệu và thứ tự trang; nhận diện trùng byte. Hai ảnh khác nhau cùng phiếu chỉ gợi ý trùng, không tự xóa. Xác nhận thuộc cùng ca trước khi gộp. |
| Căn chỉnh ảnh | OpenCV | Phát hiện biên trang, homography chỉnh phối cảnh, deskew/xoay. Giữ bản gốc; tránh xử lý làm mất dấu âm, dấu chấm và nét mảnh. Gắn cờ ảnh mờ/cắt vùng kết quả. |
| OCR chữ và bố cục | Parser local theo danh sách nghiên cứu; baseline PaddleOCR/PP-StructureV3; pdfplumber cho PDF có chữ | Toàn bộ model và inference ở server nội bộ. Lấy chữ, bảng, vị trí; benchmark để chốt checkpoint. Kiểm riêng checkbox/chữ viết tay. Chưa chạy engine cho bản mẫu hiện tại. |
| Phân loại vùng/phiếu | Luật tiêu đề, từ khóa và cột | Nhận huyết học, sinh hóa, ANA, myositis, PFT, hành chính, phần ký. Tách hướng dẫn điền khỏi kết quả bệnh nhân. |
| Khôi phục bảng | Cell của OCR, gom dòng theo tọa độ y và tiêu đề cột | Ghép đúng tên chỉ số–kết quả–đơn vị; không lấy khoảng tham chiếu làm kết quả. Bảng vỡ giữ ứng viên và vùng ảnh để kiểm. |
| Tách giá trị | Regex có ngữ cảnh, Decimal | Số, dấu so sánh, đơn vị, ngày, định tính, intensity, pattern. Chuẩn hóa dấu thập phân có điều kiện, giữ `raw`. Không biến ANA Homogeneous 3+ thành hiệu giá. |
| Phân loại nghiệp vụ | Từ điển alias có phiên bản; RapidFuzz chỉ gợi ý | Khớp tên + panel + phương pháp + loại mẫu + đơn vị. Tên gần giống chưa đủ để tự xác nhận trường. Dữ liệu ngoài bộ trường Word giữ riêng dưới dạng chưa phân loại, không tự mở rộng schema nghiệp vụ. |
| Checkbox/chữ viết tay | Nhận vùng lựa chọn và dấu tích; khả năng OCR chữ viết tay của engine | Gắn dấu với đúng nhãn, phân biệt ô trống và ô chọn; nhiều dấu hoặc khó đọc thì gắn cờ. Không suy lựa chọn từ việc thiếu dấu. |
| Nội dung tự do | Luật tiêu đề, đoạn và mẫu câu cho bố cục đã khảo sát | Chép bệnh sử, thuốc, mô tả được ghi trực tiếp; giữ phủ định, chủ thể và thời điểm. Không suy bệnh sử từ xét nghiệm. Nếu cần mô hình bổ sung phải đo riêng và yêu cầu trỏ nguồn. |
| Hợp nhất | Nhóm theo ca, chỉ số, panel, phương pháp, ngày và mẫu | Hai ảnh cùng phiếu có thể cùng chứng minh một quan sát; khác ngày/panel giữ riêng. Không ghi đè xung đột. |
| Kiểm tra | Pydantic và luật kiểu dữ liệu/nguồn | Kiểm đủ trường/thuộc tính con, kiểu, đơn vị, dấu so sánh, ngày, nguồn. Giá trị ngoài khoảng tham chiếu được gắn cờ, không tự sửa. |
| Bàn giao pool | JSON/JSON Schema, manifest file và phiên bản | Kiểm tham chiếu, mã ổn định, trạng thái, dữ liệu lặp và import lại không nhân bản. Bộ xuất Word do hệ thống phía sau thực hiện. |

Chọn checkpoint/cấu hình theo độ đúng của **trường sau ánh xạ**, khả năng truy nguồn, thời gian và tài nguyên GPU; không chỉ chất lượng nhận chữ. Dùng model đã huấn luyện sẵn, chưa cần huấn luyện mới. Môi trường đã chốt là server nội bộ, worker bị chặn Internet khi vận hành. Hiện chưa cài engine hoặc tải ảnh lên dịch vụ nào.

## 5. Các trường hợp thực tế cần xử lý

| Trường hợp | Quy tắc |
| --- | --- |
| Ảnh output có phần ngoài lupus | Bỏ khỏi phạm vi, vì Word đã lọc; không cần mở rộng lại mẫu. |
| Output có bệnh sử/ngày đồng ý/khám, input không có | Ghi thiếu; không chép ngược để tạo kết quả thử. |
| PFT có nhãn lặp | Word có 19 dòng mang nhãn chỉ số, danh mục gom thành 11 khái niệm. Giữ giá trị đo và % dự đoán; xác nhận ý nghĩa từng dòng trước khi điền. |
| Kháng thể trùng tên giữa ANA và myositis | Khóa theo panel, không ghi đè nhau. |
| dsDNA panel và dsDNA ImmunoCAP | Không điền thay nhau. |
| NXP2/OJ có trong nguồn nhưng không trong Word | Giữ riêng ngoài CRF; không nhầm OJ với EJ. |
| Word có nhãn `Mi-anpha protein`, `TIFI-gamma` | Giữ nhãn gốc, ghi ứng viên Mi-2α/TIF1γ; xác nhận alias trước khi khóa từ điển. |
| Huyết học có % và số tuyệt đối | Giữ cả hai, điền theo đúng thuộc tính đích. |
| Kết quả âm tính có intensity | Giữ cả định tính và intensity dù Word không luôn yêu cầu hiển thị số. |
| Có nhiều ngày | Tách ngày lấy mẫu/trả kết quả/đo; không tự gộp thành một lần khám. |
| Có mã bệnh viện nhưng thiếu Study ID | Không dùng thay mã nghiên cứu. |
| Cân nặng/BMI khác giữa input và output | Chỉ dùng input và đúng mốc; không chép BMI từ output. |

## 6. Bộ kết quả minh họa hiện có

- [Bản đọc dễ kiểm tra: đầy đủ danh mục](./examples/derived/CRF-EXAMPLE-001.md).
- [JSON có giá trị và bằng chứng](./examples/derived/crf-example-001.json).
- [Manifest ảnh và vai trò](./examples/derived/example-files.json).
- [Dữ liệu đọc trực quan để tái tạo mẫu](./examples/derived/visual-reading-overrides.json).

Đã có **81 mục đọc và ánh xạ được**, **10 mục có ứng viên nhưng chưa rõ ánh xạ**, **122 mục chưa thấy trong input**, **47 mục cần đánh giá ghi trong nguồn**, **1 mục chưa tính**. Đây là số mục danh mục, không phải số ô hoặc tỷ lệ chính xác engine.

Bộ mẫu được đọc trực quan, chưa được kiểm chứng độc lập. **Chưa có engine OCR tự động hoặc pool vận hành**. Việc gom ảnh thành ca theo thư mục mẫu chưa thay thế xác nhận định danh; IN12 không thấy định danh trên trang. Schema chi tiết và kiểm import pool vẫn là phần việc triển khai; xuất/render Word thuộc hệ thống phía sau.

Tái tạo bằng `scripts/build_crf_contract.ps1`, sau đó `scripts/build_visual_example.ps1`. Script đầu tạo danh mục, kiểm kê và khung rỗng; script sau ghép dữ liệu đọc trực quan và kiểm đủ mã, trạng thái, nguồn input.

## 7. Tiêu chí nghiệm thu

1. **Đủ cấu trúc 100%:** mọi trường, thuộc tính con, lựa chọn và nhóm lặp theo Word có định nghĩa trong schema; mỗi trường trong gói dữ liệu có giá trị/liên kết quan sát hoặc trạng thái hợp lệ.
2. **Mọi giá trị đều có nguồn input:** đúng ảnh/trang/vùng hoặc trích dẫn; không lấy từ output tham khảo, nhãn in sẵn hoặc suy đoán.
3. **Đúng dữ liệu có trong input:** đối chiếu bộ nhãn độc lập; so số, dấu, đơn vị, panel, ngày và lựa chọn. Báo cả tỷ lệ tìm đủ và tỷ lệ điền đúng theo loại trường/chất lượng ảnh.
4. **Thiếu/xung đột xử lý rõ:** không âm tính hóa trường thiếu, không mất quan sát khác ngày, không tự điền trường chưa rõ ánh xạ.
5. **Pool nhập được:** gói JSON hợp lệ, nguồn tham chiếu đầy đủ, nhập lại không nhân bản; giữ được nhiều thời điểm, phiên bản và lịch sử đối chiếu. Không lấy DOCX/render làm tiêu chí nghiệm thu OCR.
6. **Có giới hạn đo được:** chốt ngưỡng độ chính xác sau thử engine ở tuần 2. Bộ ảnh hiện tại dùng phát triển, chưa đủ chứng minh với bệnh viện/bố cục mới.

Lịch triển khai: [6 tuần OCR → pool dữ liệu](./IMPLEMENTATION-TIMELINE.md).
