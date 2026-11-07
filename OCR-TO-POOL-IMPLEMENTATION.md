# Đề xuất triển khai ảnh hồ sơ → pool dữ liệu lupus

Cập nhật 05/11/2026. Căn cứ: bộ trường Word đã lọc lupus, 12 ảnh input, [review notebook SenOCR-Vi](./research/senocr-vi/NOTEBOOK-REVIEW.md), server xử lý nội bộ; máy hiện truy cập có RTX 2050 4 GB. Đây là đề xuất, chưa phải pipeline hoặc kết quả benchmark mới.

Đã bổ sung [bản triển khai thử và lệnh chạy](./OCR-POOL-RUNBOOK.md): adapter bảng, parser theo trường và pool ứng viên; cùng dữ liệu giả để kiểm thử riêng. Tài liệu đề xuất dưới đây vẫn mô tả mục tiêu đầy đủ, gồm layout tự động và kiểm định OCR; không coi các kiểm thử parser là bằng chứng đã hoàn thành toàn pipeline.

## 1. Phương án ưu tiên

**Giữ SenOCR-Vi làm bộ nhận dạng; bổ sung phân tích bố cục và vùng bảng; tạo biểu diễn hàng/cột trung gian; dùng parser và từ điển nghiệp vụ để sinh ứng viên theo schema; kiểm tra và đối chiếu rồi nhận vào pool.**

Phạm vi ưu tiên đã chốt: **đọc đúng các chỉ số và thông tin cần để đưa vào các trường data pool**. Ghi chú bên lề phục vụ nhập liệu, tên người ký, phiên bản phần mềm và chữ trang trí không thuộc đầu ra nghiệp vụ bắt buộc. Giữ tên chỉ số, kết quả số/định tính, dấu so sánh, đơn vị, ngữ cảnh cột/panel và thông tin định danh/ngày cần để gắn đúng hồ sơ. Khoảng tham chiếu/phương pháp được giữ khi cần theo định nghĩa trường hoặc để phân biệt kết quả. Không bỏ nội dung chỉ vì viết tay: giá trị, ngày lấy mẫu, dấu chọn hoặc kết luận nằm trong trường cần thu vẫn thuộc phạm vi. Với các ảnh hiện có, ví dụ cần giữ ngày/giờ và lượng mẫu ở IN12; `3+` viết tay ở IN10 cần đối chiếu ý nghĩa trước khi nhận vào trường kết quả.

Mức đầy đủ được xét trên **các trường có bằng chứng trong tập hồ sơ đã xử lý**, không yêu cầu một phiếu xét nghiệm cung cấp mọi trường của Word. Thiếu dữ liệu nguồn thì giữ trạng thái thiếu/chưa đọc được, không suy đoán để lấp đầy. Khi đánh giá sau này, ưu tiên độ đúng của tên–kết quả–đơn vị–cột và độ bao phủ trường; lỗi đọc ghi chú ngoài phạm vi không tính là thiếu trường nghiệp vụ. Hiện chưa chạy đánh giá mới.

Tối ưu ở đây là cân bằng độ đúng của dữ liệu, số lần suy luận, VRAM và công sức đối chiếu. Chưa có phép thử chứng minh đây là phương án tốt nhất tuyệt đối. Không cần huấn luyện mới hoặc nạp thêm LLM trong vòng thử đầu tiên cho các bảng xét nghiệm.

```text
Word lupus → từ điển trường có phiên bản / schema pool
                                    ↓
Ảnh gốc → kiểm ảnh + định danh tài liệu → phân tích bố cục
                                    ↓
                     vùng bảng / văn bản / lựa chọn
                                    ↓
                 SenOCR-Vi theo tác vụ của từng vùng
                                    ↓
                OCR nguyên bản + bảng/hàng/cột trung gian
                                    ↓
                parser theo loại phiếu + từ điển nghiệp vụ
                                    ↓
                   bản ghi ứng viên có bằng chứng
                                    ↓
                kiểm schema / ngữ nghĩa / đối chiếu nguồn
                         ↙                     ↘
                vùng cần kiểm tra       dữ liệu đủ điều kiện
                         ↘                     ↙
                 pool có trạng thái và lịch sử duyệt
                                    ↓
                    hệ thống lưu trữ phía sau
```

Pool có thể chứa cả bản nháp và bản đã duyệt nếu tách trạng thái rõ. Luồng dữ liệu chính thức của hệ thống phía sau mặc định chỉ dùng bản đủ điều kiện theo quy trình duyệt. Xuất Word là thành phần phía sau; không dùng vị trí ô Word làm khóa dữ liệu.

## 2. Chốt nghĩa trường trước khi xử lý toàn bộ ảnh

Từ [261 mục danh mục hiện có](./schemas/crf-template-fields.json), hoàn thiện từ điển máy đọc được. Một mục có thể có nhiều thuộc tính/lựa chọn, không mặc định 261 mục là 261 biến nguyên tử.

| Thuộc tính từ điển | Dùng để làm gì |
| --- | --- |
| `field_id`, nhãn và định nghĩa | Khóa nghiệp vụ ổn định, phân biệt các khái niệm gần tên |
| Kiểu và thuộc tính con | Số/định tính/văn bản/lựa chọn; kết quả, đơn vị, pattern, intensity, liều, thời gian… |
| Tên nguồn/alias | Khớp nhãn viết tắt hoặc Việt/Anh đã xác nhận |
| Panel/phương pháp/loại mẫu | Phân biệt cùng tên nhưng khác xét nghiệm/ngữ cảnh |
| Đơn vị/giá trị cho phép | Kiểm tương thích, không tự điền đơn vị không có trong nguồn |
| Tính lặp/điều kiện áp dụng | Giữ nhiều lần xét nghiệm, nhiều thuốc, phần mô tả hoặc lựa chọn phụ |
| Trích trực tiếp hay cần đánh giá | Không suy điểm bệnh, chẩn đoán hoặc tiêu chí lâm sàng từ một dòng xét nghiệm |
| Nguồn định nghĩa và phiên bản | Truy về Word và quản lý thay đổi nghĩa trường |

Ví dụ thật trong danh mục: C3 là `IMM11`, nhưng còn các tiêu chí `EAC19`/`EAC20` liên quan C3/C4 thấp. Một kết quả C3 được phân loại vào `IMM11`; không tự chuyển thành kết luận tiêu chí phân loại. Đây là lý do không thể chỉ fuzzy-match từ khóa rồi điền mọi trường có tên gần giống.

Giữ đủ danh mục trong gói pool, nhưng một tài liệu chỉ tạo các quan sát thực sự có trong tài liệu đó. Không gọi model 261 lần hoặc yêu cầu mỗi phiếu cung cấp đủ mọi trường.

## 3. Nhận dạng theo vùng thay cho một prompt toàn trang

### Công cụ đề xuất

| Thành phần | Chọn để thử trước | Vai trò |
| --- | --- | --- |
| Tiền xử lý | OpenCV/Pillow | EXIF, xoay/phối cảnh khi cần; lưu biến đổi tọa độ |
| Bố cục | Module layout của pipeline PaddleOCR-VL, cấu hình/model được khóa sau thử | Tìm bảng, header, đoạn văn, các vùng nội dung; crop và thứ tự đọc |
| Nhận dạng | SenOCR-Vi qua Transformers/native support | Prompt `Table Recognition:` cho bảng, `OCR:` cho văn bản; giữ raw output |
| Bảng trung gian | Adapter Python; lxml khi output HTML | Khôi phục hàng/cột, ô gộp và tiêu đề; không mặc định mọi backend trả cùng định dạng |
| Trích và chuẩn hóa | Parser theo loại phiếu; regex/Decimal; từ điển có phiên bản | Chuyển cell thành bản ghi nghiệp vụ |
| Kiểm cấu trúc | Pydantic/JSON Schema | Kiểu, thuộc tính bắt buộc, mã và tham chiếu |
| Đối chiếu | Giao diện tối thiểu ảnh/crop cạnh ứng viên | Xác nhận liên kết hàng/cột, giá trị, trường và nguồn |
| Bàn giao | Pool JSON + từ điển/schema + manifest | Nhập hệ thống lưu trữ mà không lệ thuộc Word |

Pipeline PaddleOCR-VL chính thức gồm layout → crop → recognition theo vùng; tài liệu cũng phân biệt cách gọi VLM đơn lẻ với pipeline đầy đủ. API có lựa chọn `transformers` và đường dẫn recognition model riêng. [Tài liệu pipeline](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/PaddleOCR-VL.en.md).

Model card SenOCR-Vi mô tả cách dùng như recognition model của pipeline. Việc thay model/engine vẫn phải kiểm tương thích package, processor và cấu hình thực tế; không coi API tồn tại là đã chạy thành công cấu hình này. [Model card](https://huggingface.co/VietAlphaLabs/SenOCR-Vi).

### Cách chia vùng

- Tách header để lấy mã/ngày/panel nếu có, nhưng không tự gán bệnh nhân khi thiếu căn cứ.
- Mỗi bảng giữ đủ tiêu đề cột và nhãn hàng. Nếu chia bảng dài thành dải, có overlap và tiêu đề lặp, giữ tọa độ để hợp nhất.
- Không resize cả trang quá nhỏ rồi mất chữ xét nghiệm. Đo số pixel, token và bộ nhớ của crop thực tế.
- Trang phần cuối/ký được phân loại riêng; chỉ OCR phần có chữ cần thiết, vẫn giữ tài liệu gốc/metadata. Không bỏ trang dựa duy nhất vào OCR trả rỗng.
- Văn bản/bệnh sử/thuốc và dấu chọn dùng nhánh riêng; bảng xét nghiệm không phải cấu trúc chung cho mọi trường.

POC ban đầu có thể dùng crop được đánh dấu thủ công để đánh giá recognition và parser độc lập với lỗi layout. Đây là chú thích vùng trong bộ phát triển, không phải quy trình nhập tay kết quả bệnh nhân. Sau khi đạt chất lượng mới tự động hóa layout và đo toàn pipeline.

Các prompt trên là tác vụ recognition được Transformers mô tả, không phải prompt tự do yêu cầu model suy toàn bộ schema. [Tài liệu tác vụ](https://huggingface.co/docs/transformers/model_doc/paddleocr_vl#usage-tips).

## 4. Giữ lớp bảng trung gian để biết số nào thuộc cột nào

Đầu ra trung gian gồm tài liệu/vùng, các ô logic, tiêu đề và vị trí nếu công cụ cung cấp:

```text
document_id → region_id → table_id
                         → cell_id / row / col / rowspan / colspan / text
```

Một adapter đọc đúng định dạng backend trả về và chuyển sang dạng cell. Nếu output là HTML, parse cấu trúc bằng lxml, xử lý `rowspan/colspan` và giữ ID ô gốc. Nếu chỉ có text mất cấu trúc, không giả tạo bảng chắc chắn từ thứ tự token; đọc lại crop bằng tác vụ bảng hoặc thêm detector/khôi phục cell.

Gán vai trò cột bằng từ khóa tiêu đề và bố cục: tên chỉ số, kết quả, đơn vị, khoảng tham chiếu, intensity, class, pre/post, %pred… Ràng buộc này theo từng loại phiếu. Số đọc đúng nhưng nằm trong cột tham chiếu hoặc %pred không được dùng làm kết quả đo.

Tọa độ block/bảng không phải tọa độ từng cell. Nếu chỉ có bbox crop, giữ bằng chứng mức vùng và cell logic; không tạo bbox cell giả. Mỗi phép xoay/crop/resize phải truy được về ảnh gốc.

Kiểm số cột, header, hàng mất nhãn, số trong ô, bảng hỏng và output lặp. Những kiểm tra này giúp phát hiện lỗi cấu trúc nhưng không chứng minh nội dung model sinh là đúng với ảnh.

## 5. Parser theo nhóm → bản ghi ứng viên theo schema

| Nhóm | Cách xử lý chính | Điểm không được nhầm |
| --- | --- | --- |
| Sinh hóa/huyết học/nước tiểu | Dòng tên–kết quả–đơn vị–tham chiếu; tách số/dấu/định tính | Kết quả và tham chiếu, % và số tuyệt đối, ngày lấy mẫu và ngày trả |
| ANA/myositis/panel | Giữ panel, antigen, intensity, class/định tính và phương pháp | Cùng tên giữa panel; intensity và hiệu giá; không suy âm/dương nếu nguồn chỉ có số mà thiếu quy tắc đã chốt |
| PFT | Giữ header nhiều tầng và cột measured/%pred/pre/post | Không lấy bất kỳ số nào trong hàng làm giá trị đo; không suy số từ đường cong |
| Hành chính/đo thể trạng | Trích cặp nhãn–giá trị và mốc; kiểm định danh | Mã bệnh viện và Study ID; tuổi và ngày sinh; thông tin người ký và bệnh nhân |
| Thuốc/bệnh sử/mô tả | Giữ đoạn nguồn, chủ thể, phủ định, thời điểm và thuộc tính thuốc | Hướng dẫn mẫu và nội dung bệnh nhân; kê đơn và thực dùng; suy bệnh sử từ xét nghiệm |
| Checkbox/điểm ghi sẵn | Nhận đúng nhãn và trạng thái được ghi, giữ nguồn | Ô trống và No; điểm được ghi và điểm tự tính |

Thứ tự phân loại: khớp alias đã xác nhận → kiểm ngữ cảnh panel/phương pháp/loại mẫu/đơn vị → xác định mã trường → chuẩn hóa được phép. RapidFuzz chỉ gợi ý mục cần duyệt, không quyết định tự động từ khoảng cách chuỗi.

Giữ nguyên số và đơn vị nguồn bên cạnh giá trị chuẩn hóa. Chuyển dấu phẩy thập phân theo quy tắc có ngữ cảnh; dùng Decimal. Không làm tròn, đổi đơn vị, gán ngày hoặc phương pháp không có căn cứ. Không tự sửa giá trị bất thường thành giá trị hợp lý y khoa.

**Chưa cần LLM bổ sung cho vòng đầu trên bảng.** Nếu parser thiếu khả năng với đoạn văn tự do, thêm bộ trích văn bản chạy nội bộ theo nhóm trường: chỉ lấy thông tin có trong đoạn nguồn, trả liên kết/trích dẫn và cho phép null. Giới hạn field IDs ứng viên, không yêu cầu suy đủ mọi trường. Model ngôn ngữ không khôi phục chắc chắn hàng/cột đã mất từ OCR. Với GPU 4 GB, xử lý bổ sung theo lượt riêng; không mặc định nạp đồng thời OCR và LLM.

Toàn bộ nhóm trường vẫn có trong schema từ đầu. Khi chưa trích tin cậy được nhóm nào, ghi rõ phạm vi chưa hỗ trợ/trạng thái cần đối chiếu; không đổi thành `not_found` để báo đủ.

## 6. Ví dụ bản ghi bàn giao

Dữ liệu giả, dùng `IMM11` là mã C3 có thật trong danh mục. Rút gọn metadata; không mô tả một kết quả bệnh nhân hiện có:

```json
{
  "observation_id": "DEMO-OBS-001",
  "field_id": "IMM11",
  "name_raw": "C3",
  "result_raw": "0,65",
  "result_type": "numeric",
  "numeric_value": "0.65",
  "comparator": "=",
  "unit_raw": "g/L",
  "reference_range_raw": "0,9–1,8",
  "source_date": null,
  "date_type": null,
  "evidence_ids": ["DEMO-EV-001"],
  "extraction_status": "found",
  "review_status": "pending"
}
```

`DEMO-EV-001` trỏ tới tài liệu, ảnh/vùng/cell và trích dẫn trong gói đầy đủ. Đây là ID minh họa, chưa phải tham chiếu đã được tạo. Không chỉ đưa quote do model sinh vào pool rồi coi đó là bằng chứng đã xác minh: cần mở được ảnh/vùng để đối chiếu.

Gói đầy đủ theo [hợp đồng pool](./OCR-DATA-POOL-CONTRACT.md): schema/dictionary version, tài liệu, processing runs, observations, fields, evidence, trạng thái duyệt và manifest. Một field có nhiều observation IDs theo thời gian. Không ép thành một giá trị cuối cho Word.

## 7. Cổng kiểm tra trước khi dùng dữ liệu chính thức

| Kiểm tra | Cách quyết định |
| --- | --- |
| Schema/ID | Kiểu hợp lệ, mã trường tồn tại, tham chiếu tài liệu/bằng chứng đúng |
| Hàng/cột | Tên–kết quả–đơn vị đúng quan hệ; không dùng tham chiếu làm kết quả |
| Nguồn | Xác minh giá trị với ảnh/crop; giữ đúng độ chi tiết bằng chứng |
| Ngữ cảnh | Panel/phương pháp/mẫu/ngày và định danh đủ chắc để phân loại/liên kết |
| Lỗi sinh | Output rỗng, lặp, cắt token, dữ liệu không có nguồn được chặn hoặc gắn cờ |
| Trùng/lịch sử | Ảnh khác cùng phiếu không tự tạo hai kết quả; khác mẫu/ngày không bị ghi đè |
| Phạm vi xử lý | Chỉ `not_found` khi nguồn liên quan đã xử lý thành công; phân biệt lỗi/chưa hỗ trợ |

Vòng POC: mọi ứng viên ở `pending`, đối chiếu các dòng mục tiêu trước khi đánh dấu verified. Chỉ mở tự chấp nhận cho loại trường/bố cục đã có kết quả đo đáng tin cậy và quy trình duyệt chấp thuận. Không đặt ngưỡng confidence tùy ý; JSON hợp lệ và hai engine đồng ý chưa chứng minh số đúng.

Nếu hàng/cột thiếu hoặc đầu ra lặp, thử lại đúng vùng cần thiết. Không đọc lại toàn bộ 12 ảnh bằng engine thứ hai mặc định. Vẫn giữ bản gốc, output lỗi và lịch sử sửa; không sửa âm thầm thành dữ liệu đúng hình thức.

## 8. Cấu hình và chi phí xử lý

- Giữ SenOCR-Vi FP16 làm baseline tái lập notebook, `use_cache=True`, SDPA, batch 1. Khóa revision/runtime và kiểm lại warning/parameter count; đối chứng FP32 trên GPU đủ bộ nhớ cho những vùng cần kiểm chất lượng precision.
- Notebook trên T4 đo peak allocated 2,012 GiB và reserved 2,166 GiB khi chạy recognition trực tiếp. Đây không phải số VRAM của pipeline layout + nhiều crop, cũng không phải tốc độ RTX 2050.
- Ưu tiên layout trên CPU nếu backend và tốc độ đáp ứng. Nếu phải chạy GPU, tách pha hoặc giải phóng model layout trước recognition khi bộ nhớ hạn chế; đo lại chứ không cộng các yêu cầu ước tính rồi cam kết chạy vừa.
- Cache theo hash ảnh + biến đổi/crop + revision model + processor + prompt + cấu hình. Sửa từ điển/parser không buộc chạy lại OCR; thay ảnh/crop/model mới tạo kết quả khác.
- Lưu OCR nguyên bản và bảng trung gian để tái trích nhiều trường bằng Python. Không chạy lại model cho mỗi field hoặc mỗi lần xuất Word.
- Phát hiện/cắt vòng lặp để giảm thời gian lãng phí; không cắt ngắn mọi output và coi là đọc đủ. Token cap và cờ lặp là hai chỉ số riêng.
- Các model, thư viện và inference chạy nội bộ khi triển khai. Notebook Kaggle là bằng chứng thử có sẵn, không phải kiến trúc vận hành theo yêu cầu bảo mật.

## 9. Thứ tự thực hiện và tiêu chí quyết định

1. **Chuẩn bị:** lấy text/CSV đầy đủ từ notebook và gán nhãn quan sát từ ảnh gốc; hoàn thiện schema. Không lấy đoạn hiển thị 1500 ký tự hoặc output model làm ground truth.
2. **POC trên phiếu đại diện:** IN01/IN11 cho bảng thông thường, IN04/IN06 cho panel, IN02 cho PFT; IN05/IN07 kiểm sinh lặp, IN12 kiểm dữ liệu sinh thừa. Đánh giá crop/table adapter trước khi đo tự động layout.
3. **Nối pool:** parser → ứng viên → đối chiếu → gói JSON nhập thử. Kiểm đủ trường/thuộc tính, trường thiếu, nhiều thời điểm, nhập lặp và lịch sử sửa.
4. **Mở rộng toàn bộ nhóm trường:** thuốc, bệnh sử, cơ quan, lựa chọn, đánh giá được ghi; thêm bộ trích nội bộ khi có lỗi cụ thể chứng minh cần thiết. Không tuyên bố hoàn thành toàn bộ phạm vi bằng parser xét nghiệm.
5. **Đo toàn pipeline:** precision/recall từng tuple, đúng hàng/cột, thiếu/thừa, số lỗi không có nguồn được nhận vào pool, tỷ lệ phải duyệt, latency ảnh → pool và VRAM đỉnh. Báo riêng hình khó/trang ký/đồ thị; không dùng trường thiếu đúng để tăng tỷ lệ chính xác.

Mục tiêu nghiệm thu là thu đúng, đủ dữ liệu có trong nguồn và biểu diễn đủ bộ trường yêu cầu, với trạng thái rõ cho phần thiếu/khó đọc/chưa xử lý. Chưa đặt tỷ lệ chính xác hoặc mục tiêu giây/ảnh chưa được đo. Bộ 12 ảnh phục vụ phát triển; trước tự động hóa cần ca/bố cục mới, chia tập theo bệnh nhân/phiếu để tránh rò rỉ giữa các ảnh cùng nguồn.

Lịch tổng thể vẫn [6 tuần](./IMPLEMENTATION-TIMELINE.md): tuần 1–2 schema và recognition theo vùng/benchmark; tuần 3–4 parser và hợp đồng pool; tuần 5–6 đối chiếu, kiểm toàn bộ nhóm và nghiệm thu. Chưa tải thêm model hoặc chạy lại notebook trong lần đề xuất này.
