# Đề xuất kỹ thuật OCR CRF lupus trên server nội bộ

> **Đề xuất hiện hành cho luồng OCR → pool:** [phân tích vùng + SenOCR-Vi + bảng trung gian + parser theo schema + đối chiếu](./OCR-TO-POOL-IMPLEMENTATION.md). Dựa trên [notebook đã chạy](./research/senocr-vi/NOTEBOOK-REVIEW.md); PP-OCRv5 bên dưới là mốc so sánh, không thay thế kết quả SenOCR-Vi đã có. Chưa đo pipeline mới trên GPU 4 GB.

> **Cập nhật sau nghiên cứu model mới 05/11/2026:** xem [nghiên cứu và danh sách benchmark](./OCR-MODEL-RESEARCH.md). Tạm hiểu GPU có 4–8 GB VRAM. Ưu tiên thử PaddleOCR-VL-1.6 và MonkeyOCRv2-B-Parsing; SenOCR-Vi kiểm phần tiếng Việt; PP-OCRv5 bên dưới giữ làm mốc so sánh, chưa phải engine cuối cùng. Không mặc định nâng recognizer sang PP-OCRv6 vì cần xác minh vấn đề ký tự dấu Việt. Đầu ra hiện hành là pool dữ liệu; Word xác định bộ trường nghiệp vụ.

Cập nhật 05/11/2026. Căn cứ: người dùng cần bảo mật thông tin y tế, có server nội bộ với GPU NVIDIA; Word đã lọc ngoài lupus là nguồn xác định bộ trường. OCR tạo pool để hệ thống lưu trữ phía sau tiếp nhận và xuất Word. Đây là phương án triển khai, chưa cài đặt hoặc vận hành hệ thống.

## 1. Phương án chọn

**Dùng model OCR có sẵn chạy hoàn toàn trên server nội bộ, Python trích/chuẩn hóa thành pool dữ liệu theo bộ trường nghiệp vụ lấy từ Word.** Benchmark parser theo danh sách mới; PaddleOCR + PP-StructureV3 là baseline. Không gửi ảnh hoặc nội dung hồ sơ ra dịch vụ OCR/AI cloud.

Model OCR là thành phần bắt buộc. OpenCV chỉ xử lý ảnh; regex/từ điển chỉ xử lý kết quả đọc. Chưa cần tự huấn luyện model từ đầu với bộ 12 ảnh hiện tại.

Luồng xử lý:

```text
Máy người dùng trong mạng nội bộ
        │ HTTPS + đăng nhập
        ▼
Ứng dụng nhận hồ sơ / xem ảnh cạnh trường / tải kết quả
        │
        ▼
Hàng đợi nội bộ → Worker trên GPU NVIDIA
        │
        ├─ Kiểm tra ảnh, xoay và chỉnh phối cảnh
        ├─ Model phát hiện vùng chữ + model nhận dạng tiếng Việt
        ├─ Model bố cục/bảng → ghép dòng và cột kết quả
        ├─ Quan sát có nguồn → phân loại vào trường nghiệp vụ → kiểm tra
        └─ Pool JSON có phiên bản + manifest → hệ thống lưu trữ phía sau

Hệ thống phía sau: lưu dữ liệu → truy vấn → chọn mốc/giá trị theo quy tắc → xuất Word.

File, dữ liệu, model, log và bản sao lưu lưu trong hạ tầng nội bộ.
Worker OCR bị chặn truy cập Internet khi vận hành.
```

Word là nguồn định nghĩa trường, không phải đích ghi trực tiếp của OCR. Phiếu xét nghiệm đầu vào có thể có nhiều bố cục; pool dùng mã trường nghiệp vụ ổn định, độc lập với tọa độ ô Word. Bộ xuất phía sau quản lý bố cục riêng.

## 2. Các model cụ thể

| Nhiệm vụ | Lựa chọn khởi đầu | Đầu ra / lưu ý |
| --- | --- | --- |
| Phát hiện chữ | `PP-OCRv5_server_det` | Các vùng chứa chữ. Chọn làm baseline có thể tái lập, không khẳng định là phiên bản mới nhất hoặc tốt nhất trên dữ liệu dự án. |
| Nhận dạng chữ | `latin_PP-OCRv5_mobile_rec` | Model Latin có tiếng Việt theo tài liệu PaddleOCR; chạy trên vùng chữ đã phát hiện. Cần thử riêng chữ số, dấu tiếng Việt, µ, α/β, tên kháng thể và đơn vị. |
| Bố cục và bảng | Pipeline `PP-StructureV3`, cấu hình nhánh OCR tiếng Việt | Phân vùng tiêu đề/bảng, cấu trúc hàng/cột và cell; cấu hình tường minh đường dẫn model local. Không mặc định mọi model mặc định đọc tốt tiếng Việt. |
| Bảng có/không đường kẻ | Nhánh table recognition tương ứng của pipeline | Thử trên phiếu thật để chốt checkpoint. Giữ nội dung cell và tọa độ, không chỉ HTML/Markdown. |
| Chữ viết tay | Benchmark vùng viết tay bằng cấu hình trên trước | Nếu không đạt, đánh dấu khó đọc; thử model chuyên chữ viết tay chạy local ở vòng tiếp theo. Không mặc định hỗ trợ tiếng Việt in đồng nghĩa hỗ trợ chữ viết tay y khoa. |

Cấu hình OCR bên trong PP-StructureV3 có thể dùng lại các model phát hiện/nhận dạng trên. Mỗi trang chỉ chạy các bước cần thiết; không chạy hai pipeline đầy đủ trùng nhau mặc định.

Khóa phiên bản package PaddleOCR/PaddlePaddle, checkpoint và CUDA sau kiểm tra tương thích với GPU/driver thực tế. Lưu checksum model và file khóa phụ thuộc để tái tạo môi trường. Tên model ở bảng là baseline đề xuất; chưa có kết quả benchmark trên ảnh của dự án.

Azure Layout được loại khỏi phương án vận hành hiện tại. Chữ viết tay tiếng Việt cũng không nằm trong danh sách hỗ trợ handwriting của Azure được kiểm tra tại thời điểm lập đề xuất; không lấy dịch vụ đó làm phương án mặc định cho phần viết tay.

## 3. Bộ công cụ triển khai

| Thành phần | Chọn cho bản thử 6 tuần |
| --- | --- |
| Runtime | Python; môi trường đóng gói và khóa phụ thuộc sau kiểm tra tương thích. |
| Tiền xử lý | OpenCV, Pillow. PDF dùng bộ render local và pdfplumber nếu trang có chữ dùng được. |
| Inference | Runtime phù hợp engine được chọn sau benchmark; môi trường độc lập cho baseline Paddle và parser khác. Toàn bộ weights lưu local. |
| API và giao diện | FastAPI; giao diện web tối thiểu tải hồ sơ, tiến độ, ảnh cạnh trường, sửa và xuất kết quả. |
| Worker | Tiến trình riêng nhận job từ PostgreSQL nội bộ; ban đầu một worker GPU, xử lý tuần tự để đo bộ nhớ/thời gian. |
| Dữ liệu | PostgreSQL nội bộ cho ca, tài liệu, job, quan sát, kết quả và lịch sử sửa. |
| File | Thư mục trên volume nội bộ được mã hóa và phân quyền; không dùng bucket công khai. |
| Kiểm tra cấu trúc | Pydantic/JSON Schema, Decimal, từ điển alias theo panel/phương pháp. |
| Bàn giao pool | JSON + schema/từ điển + manifest nguồn; kiểm import, ID, phiên bản và dữ liệu lặp. Xuất Word do hệ thống phía sau thực hiện. |

Đề xuất Linux + NVIDIA driver + container runtime hỗ trợ GPU nếu phù hợp server hiện có. Xác nhận OS, GPU, VRAM và driver trước khi khóa image. Chưa yêu cầu mua GPU mới; đo trên server sẵn có trước. Không đưa mô hình ngôn ngữ lớn vào cấu hình cơ sở.

## 4. Thuật toán từ ảnh đến dữ liệu

### 4.1 Nhận và kiểm tra tài liệu

- Nhận lô hồ sơ với mã ca nội bộ; kiểm định dạng/kích thước và hash file.
- Xác nhận các trang thuộc cùng ca; thiếu định danh thì giữ trạng thái chưa xác nhận, không tự gắn theo tên thư mục.
- Giữ ảnh gốc; bản xoay/căn chỉnh lưu riêng. Phát hiện trùng byte; ảnh chụp khác nhau cùng phiếu chỉ gợi ý trùng.
- Chấm chất lượng ảnh bằng chỉ số mờ, vùng bị cắt, kích thước chữ và góc xoay. Ngưỡng phải hiệu chỉnh trên mẫu, không tự xem một ngưỡng chung là tiêu chuẩn đạt.

### 4.2 Chỉnh ảnh và OCR

- Xác định biên trang, hiệu chỉnh phối cảnh khi cần; deskew theo hướng dòng chữ.
- Tránh nhị phân hóa/lọc mạnh làm mất dấu chấm, dấu âm hoặc nét số; lưu phép biến đổi tọa độ giữa ảnh gốc và ảnh xử lý.
- Model detector tìm vùng chữ; recognizer đọc vùng đó. Giữ text, polygon và confidence do engine trả về.
- Phân tích bảng, ghép vùng chữ vào cell bằng giao nhau hình học và thứ tự hàng/cột. Lưu số hàng/cột và tiêu đề cột.
- Khi ảnh khó, thử lại vùng liên quan với một cấu hình xử lý khác; không lặp vô hạn hoặc sửa số theo kỳ vọng y khoa.

### 4.3 Trích quan sát cho pool

Trước tiên tạo danh sách quan sát độc lập với Word. Mỗi quan sát gồm tên nguồn, giá trị gốc, số/định tính, dấu so sánh, đơn vị, ngày và loại ngày, panel/phương pháp/loại mẫu khi có, cùng bằng chứng ảnh/cell.

Các bộ trích riêng: sinh hóa, huyết học, nước tiểu, ANA, myositis, PFT, hành chính và đoạn mô tả/thuốc. Phân loại bằng tiêu đề và cấu trúc phiếu để chọn bộ trích phù hợp.

Regex có ngữ cảnh và Decimal tách số, dấu `<`, `>`, đơn vị và ngày. Từ điển chuẩn hóa nhãn nhưng giữ nguyên `raw`. Tách cột kết quả khỏi khoảng tham chiếu; tách intensity khỏi định tính; giữ cả số tuyệt đối và tỷ lệ phần trăm.

Với mô tả, trích nguyên thông tin được ghi trong nguồn, bảo toàn phủ định, chủ thể và thời điểm. Các bố cục chưa hỗ trợ phải được gắn cờ; không coi một vài regex là đủ cho mọi bệnh sử tự do.

### 4.4 Phân loại vào trường nghiệp vụ của pool

Khớp theo **tên + panel + phương pháp + loại mẫu + đơn vị + mốc thời gian**. Alias phải có phiên bản; fuzzy matching chỉ tạo gợi ý.

- dsDNA trong ANA không phân loại thành dsDNA ImmunoCAP.
- Ro52 của hai panel giữ riêng.
- PFT giữ giá trị đo và % dự đoán; chốt ý nghĩa dòng lặp trong Word trước khi gán.
- OJ/NXP2 không có trong Word giữ ở dữ liệu chưa ánh xạ, không thêm lại vào CRF.
- Không thấy triệu chứng không tự chọn No; thiếu điểm bệnh không tự tính.
- Khác ngày giữ quan sát riêng; không thu gọn pool thành một giá trị mới nhất cho mỗi trường.

Mỗi giá trị trong pool phải truy về quan sát nguồn. Nếu một quan sát có nhiều ứng viên phân loại, giữ đầy đủ và ghi trạng thái cần đối chiếu. Nhiều kết quả hợp lệ khác ngày không tự trở thành xung đột.

## 5. Hợp đồng đầu ra pool dữ liệu

Chuẩn hóa bộ trường từ [danh mục 261 mục](./schemas/crf-template-fields.json), kiểm mọi thuộc tính con, lựa chọn và nhóm lặp trong [20 bảng Word](./schemas/crf-word-structure.json) và nội dung ngoài bảng. 261 mục chưa phải 261 trường nguyên tử đã chốt.

Pool gồm metadata gói/schema, tài liệu và lần xử lý, các quan sát, chỉ mục theo trường, bằng chứng và lịch sử đối chiếu. Giữ số/định tính, đơn vị gốc/chuẩn hóa, ngày và loại ngày, panel/phương pháp/loại mẫu nếu có. Không buộc mọi kết quả có ngày hoặc mã bệnh nhân đã xác nhận khi nguồn thiếu; giữ trạng thái chưa xác nhận.

Gói bàn giao có mã ổn định và phiên bản để nhập lại không tạo bản ghi trùng, giữ quan sát khác ngày và bản sửa đã duyệt. Bản JSON minh họa hiện có là nhãn nháp, chưa phải hợp đồng production; xem [hợp đồng pool](./OCR-DATA-POOL-CONTRACT.md).

Mọi trường có liên kết quan sát hoặc trạng thái rõ. Hệ thống lưu trữ phía sau quyết định cách lưu và cách xuất Word, bao gồm chọn mốc thời gian và liên kết trường–ô. Thay đổi bố cục Word không tự làm thay đổi ID dữ liệu; thay nghĩa trường phải quản lý phiên bản từ điển.

## 6. Bảo mật áp dụng trong thiết kế

| Lớp | Biện pháp cụ thể |
| --- | --- |
| Luồng dữ liệu | Toàn bộ ảnh, text OCR, JSON, DOCX, thumbnail và bản render ở nội bộ. Không dùng API OCR/LLM cloud, dịch vụ analytics hoặc hệ thống ghi trace ngoài đơn vị. |
| Kết nối mạng | Worker/model bị chặn egress Internet bằng firewall/network policy, chỉ được kết nối dịch vụ nội bộ cần thiết. Kiểm chức năng khi đã chặn mạng; không chỉ dựa vào tùy chọn tắt telemetry. |
| Model và thư viện | Chuẩn bị package/weights qua quy trình chuyển gói được kiểm soát; quét và kiểm hash, lưu bản local. Cấu hình model bằng đường dẫn local, kiểm không tự tải weights khi chạy. |
| Truy cập giao diện | Chỉ trong mạng nội bộ/VPN được quản lý; HTTPS, đăng nhập và phân quyền theo ca. Dùng AD/SSO nội bộ nếu đã có. Không cho truy cập file bằng URL tĩnh công khai. |
| Quyền tiến trình | Tài khoản dịch vụ không có quyền quản trị; chỉ đọc model, chỉ truy cập thư mục và bảng cần thiết. GPU/container không thay thế cơ chế phân quyền. |
| Dữ liệu lưu trữ | Mã hóa volume và backup; ví dụ LUKS trên Linux hoặc BitLocker trên Windows. Giới hạn ACL; quản lý khóa theo hạ tầng đơn vị. Mã hóa ổ không bảo vệ khỏi tài khoản đang được cấp quyền truy cập. |
| Log và kiểm toán | Log mã job/tài liệu, bước xử lý, lỗi đã làm sạch, người xem/sửa/xuất và thời điểm. Không ghi ảnh, tên bệnh nhân, kết quả xét nghiệm hoặc toàn bộ request vào log vận hành. |
| File tạm | Ảnh crop, text trung gian, file render nằm trên volume nội bộ được kiểm soát; có thời hạn dọn và chính sách giữ bản gốc riêng. Không để dữ liệu phát tán vào thư mục debug mặc định. |
| Sao lưu | Backup mã hóa, phân quyền riêng, có bản tách biệt và kiểm tra khôi phục. Thời hạn lưu/xóa do đơn vị chốt; không tự chọn thời hạn cho hồ sơ y tế. |
| Môi trường phát triển | Dùng dữ liệu giả/đã khử định danh khi có thể. Bộ ảnh thật hiện có không đưa lên Git, issue, CI công khai hoặc nền tảng theo dõi bên ngoài. |

Đây là các kiểm soát kỹ thuật đề xuất; chưa phải kết quả kiểm tra bảo mật hoặc xác nhận đáp ứng toàn bộ quy định của đơn vị. Khi triển khai cần kiểm trực tiếp quyền, đường mạng và cấu hình thực tế.

## 7. Chạy lại và quan sát hệ thống

Theo dõi bước xử lý `received → preprocessed → ocr_done → extracted → classified → packaged`, có nhánh lỗi và số lần thử. Trạng thái đối chiếu `pending/needs_review/verified` tách riêng; đóng gói dữ liệu chưa duyệt phải giữ nguyên cờ. Trường thiếu không phải lỗi chạy OCR. Chỉ gán `not_found` sau khi đã xử lý thành công các trang liên quan; trang lỗi không được biến thành thiếu thông tin.

Chạy lại tạo phiên bản mới; không ghi đè bản người dùng đã sửa. Dùng hash tài liệu + phiên bản pipeline/cấu hình làm khóa nhận diện lần xử lý. Một job có cơ chế claim và thời hạn để phục hồi khi worker dừng; chưa cần Redis/Celery cho một worker ban đầu.

Lưu phiên bản model, checkpoint hash, cấu hình tiền xử lý, parser, từ điển và Word. Đo thời gian/bộ nhớ GPU/tỷ lệ lỗi bằng metadata nội bộ. Chưa cần triển khai Langfuse; bộ benchmark và log được giữ local, không gửi trace y tế ra ngoài.

## 8. Đo chất lượng dữ liệu trong pool

Bản đọc trực quan hiện có chỉ là nhãn nháp, cần người đối chiếu. Tách input, expected output và metadata; không dùng ảnh output làm expected output nếu chứa giá trị không có trong input.

Đánh giá theo quan sát/giá trị, không chỉ theo 261 mục, vì nhiều mục hiện không có bằng chứng. Không tính các trường thiếu đúng thành thành công để làm tăng tỷ lệ đọc đúng.

- **Precision:** số quan sát trích và phân loại đúng / số quan sát hệ thống trả ra.
- **Recall:** số quan sát có trong nguồn được trích và phân loại đúng / tổng quan sát nguồn đã được gán nhãn.
- **Khớp đúng kết quả:** so cả số, dấu, đơn vị, panel, ngày và loại giá trị; không chỉ tên xét nghiệm.
- **Đúng cấu trúc:** đủ trường nghiệp vụ, thuộc tính con, lựa chọn và nhóm lặp theo Word; đúng tham chiếu giữa dữ liệu và nguồn.
- **Tỷ lệ cần kiểm tra:** phần khó đọc, mâu thuẫn, mơ hồ, kèm nguyên nhân.
- **Vận hành:** thời gian/trang và/ca, VRAM cao nhất, số lần xử lý lại; đo trên GPU thực tế.

Giữ các ảnh của cùng phiếu/ca trong cùng tập khi chia phát triển và kiểm tra, tránh một ảnh của phiếu ở mỗi tập. Bộ hiện tại nhỏ, chưa đủ khẳng định chất lượng với bệnh viện mới. Không dùng các biến thể cùng ảnh làm dữ liệu kiểm tra độc lập.

Điều kiện tự chấp nhận ứng viên kết hợp confidence đã hiệu chỉnh trên nhãn thật nếu engine có, tính chắc của phân loại, bằng chứng và không có xung đột. Không gán sẵn quy tắc “confidence > 0.9 là đúng” cho mọi model/loại trường. Các lỗi số, dấu, đơn vị hoặc nhầm bệnh nhân phải chặn để đối chiếu.

## 9. Trình tự triển khai trong 6 tuần

| Tuần | Ưu tiên |
| --- | --- |
| 1 | Kiểm server/GPU, dựng môi trường local, tải/kiểm model; kiểm chứng nhãn và schema nghiệp vụ từ Word; chạy OCR mẫu đầu tiên. |
| 2 | Benchmark detector/recognizer/table pipeline trên GPU, xử lý ảnh, lưu tọa độ; kiểm chạy khi chặn egress. Chốt cấu hình. |
| 3 | Parser xét nghiệm/panel/PFT, từ điển, chuẩn hóa và bằng chứng; đầu ra JSON toàn bộ trường. |
| 4 | Các nhóm còn lại theo Word, trạng thái thiếu/xung đột, gói pool đầu tiên và kiểm hợp đồng import. |
| 5 | Màn hình đối chiếu, sửa/đóng gói lại, phân quyền, log kiểm toán; sửa lỗi dữ liệu và kiểm nhập lặp. |
| 6 | Thử độc lập khi có thêm ca; kiểm quyền, không có kết nối ra ngoài, backup/restore, nghiệm thu và hướng dẫn. |

Đầu ra cần bàn giao: cấu hình chạy nội bộ, model/phiên bản đã khóa, bộ trích/chuẩn hóa, ứng dụng đối chiếu, pool JSON + schema/từ điển/manifest có nguồn và báo cáo chất lượng/giới hạn. Xuất DOCX thuộc hệ thống phía sau. Chưa triển khai các thành phần này trong lượt đề xuất.

## 10. Nguồn kỹ thuật

- [PaddleOCR: OCR pipeline và model recognition](https://paddlepaddle.github.io/PaddleOCR/main/en/version3.x/pipeline_usage/OCR.html).
- [PaddleOCR: PP-OCRv5 multilingual, danh sách ngôn ngữ](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html).
- [PaddleOCR: PP-StructureV3](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/PP-StructureV3.en.md).
- [Microsoft: ngôn ngữ hỗ trợ, tách chữ in và chữ viết tay](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/language-support/ocr?view=doc-intel-4.0.0).
- [Langfuse: thiết kế input/expected output/metadata để đánh giá](https://langfuse.com/academy/datasets), chỉ tham khảo phương pháp; không triển khai hoặc gửi dữ liệu vào dịch vụ.

Các nguồn tra cứu là tài liệu công khai; không gửi ảnh hoặc nội dung bệnh nhân để tra cứu.
