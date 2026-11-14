# Tiêu chí chấm kết quả đọc phiếu vào CRF

Phạm vi v1 là trích xuất dữ liệu từ ảnh vào CRF. Đơn vị chấm chính là **một giá trị của một thành phần CRF, trên một hàng nguồn cụ thể**. Ví dụ, số đo Pre và `%Pre` trên cùng hàng hô hấp ký là hai giá trị để chấm nội dung và một hàng để chấm vị trí. Thông tin do OCR tại máy cung cấp, mục ngoài CRF và thu mẫu có thống kê riêng.

## Dữ liệu đối chiếu

1. Lập đáp án từ ảnh nguồn trước khi xem kết quả model. Mỗi hàng ghi mã tài liệu, vùng/bảng, nhãn in, số thứ tự xuất hiện và thuộc tính cần đọc. Ghi mã CRF, component hoặc trạng thái ngoài CRF. Với cùng nhãn lặp lại, giữ từng lần xuất hiện có nguồn riêng.
2. Ghi rõ trạng thái từng thuộc tính trong đáp án. Dùng `đọc được`, `không có trên phiếu`, `không rõ`, `đã che` hoặc `chưa gán nhãn`. Chỉ tính độ chính xác của thuộc tính khi đáp án xác định được điều phải trả. Với mục đã che hoặc không có trên phiếu, kiểm tra model có tự điền hay không. Với nguồn mơ hồ, kiểm tra model có giữ lại để đối chiếu hay không.
3. Ghép kết quả với nguồn theo tài liệu, vùng/bảng, nhãn đã chuẩn hóa và thứ tự xuất hiện. Khóa bảng tên tương đương trước khi so sánh model. Dùng vị trí và tên trên phiếu để phân biệt các hàng có tên gần nhau. Trường hợp không ghép được một cách duy nhất được ghi là cần đối chiếu. Không dùng số kết quả hoặc mã CRF dự đoán để chọn hàng khớp.
4. Lưu hash ảnh gửi, đáp án và phiên bản tiêu chí. Ghi model thực trả, prompt/schema, phiên bản từ điển, bước cắt/che, chuẩn hóa và lượt kiểm lại. Khi so model, dùng cùng bộ ảnh, cùng phạm vi đáp án và cùng cách chấm. Để đánh giá khả năng áp dụng phiếu mới, tách tập kiểm thử theo bệnh nhân hoặc hồ sơ, gồm mẫu phiếu khác bộ đã dùng để sửa hệ thống.

## Các tiêu chí

| Tiêu chí | Khi nào đạt | Chỉ số cần báo cáo |
|---|---|---|
| **Đọc đủ hàng** | Mỗi hàng nguồn có kết quả tương ứng và giữ đúng lần xuất hiện. Hàng bị bỏ sót hoặc được tạo thêm phải có mã lỗi. | Số hàng ghép được / số hàng cần đọc. Báo riêng hàng thiếu, hàng thừa và hàng chưa ghép được. |
| **Đúng giá trị** | Khớp số, dấu `<`, `>`, `≤`, `≥` khi in trên phiếu, đơn vị và kết quả định tính. Khớp ký hiệu Class, pattern, grade và titre khi có. Chuẩn hóa `4.90` thành `4.9` hoặc hai cách viết cùng đơn vị được phép theo bảng quy tắc đã khóa. Giữ `o` và `0` là hai ký hiệu khác nhau. | Số giá trị đúng / số giá trị có đáp án. Báo riêng lỗi số, dấu, đơn vị, định tính và ký hiệu. |
| **Đúng mã và thành phần CRF** | Khớp mã, component và chi tiết phân biệt trên phiếu, như Hb, panel, loại mẫu, số lượng tuyệt đối/% hoặc Pre/Post. Một hàng ngoài CRF phải được giữ ngoài CRF. | Số giá trị CRF đúng cả nội dung và mã / số dự kiến, cùng số đó / số thực tế đưa vào CRF. Báo riêng số trường ngoài CRF bị gán vào CRF. |
| **Đúng thuộc tính nguồn** | Khi thuộc tính có đáp án, giữ đúng phương pháp, kiểu chữ của grade, quan hệ grade với ô kết quả, ngày và vai trò ngày. Ngày lấy mẫu và ngày đo được kiểm riêng. | Số đúng / số có đáp án cho từng thuộc tính. Báo riêng số thiếu, số đã che và số chưa có đáp án. |
| **Đúng hàng trên ảnh** | Hộp đúng hệ tọa độ của ảnh gửi, bao được nhãn và ô kết quả của hàng mục tiêu. Hộp phủ nhầm giá trị ở hàng kế cận bị tính sai. Dùng ảnh đã cắt/che đúng hash để gán nhãn và chấm. | Tỷ lệ có hộp hợp lệ, tỷ lệ đúng trong số hộp đã trả, và tỷ lệ đúng trên toàn bộ hàng có đáp án vị trí. Chấm một lần cho mỗi hàng vật lý. |
| **An toàn khi đưa vào CRF** | Mỗi giá trị có bằng chứng nguồn, dữ liệu nhập lặp không sinh bản ghi trùng, trường mơ hồ vẫn có trạng thái cần đối chiếu. Kết quả OCR tại máy và LLM giữ được nguồn gốc riêng. | Đếm lỗi theo loại và liệt kê các giá trị bị giữ. Đo thời gian, chi phí và số lượt API ở mục riêng. |

Nếu dùng IoU cho vị trí, ghi ngưỡng trước khi chạy và kết hợp với kiểm tra hộp chứa nhãn, chứa kết quả, không lấy kết quả hàng bên cạnh. Một hộp có tọa độ hợp lệ chỉ được tính là có hộp, còn đúng hàng phải so với nhãn vị trí hoặc kiểm trực tiếp trên ảnh.

## Cách tính điểm

Điểm chính là **điểm khớp nghiêm ngặt CRF trên 100**. Tính theo từng bộ ảnh và cùng một phạm vi thuộc tính.

- `E` là số giá trị CRF dự kiến trong đáp án. `P` là số giá trị model thực tế đưa vào CRF, kể cả giá trị đưa nhầm từ ngoài CRF hoặc tạo trùng.
- `T` là số giá trị ghép đúng nguồn, đúng giá trị, đúng mã/component và đạt mọi thuộc tính nguồn bắt buộc đã có đáp án. Ghép một đối một, mỗi giá trị chỉ được tính đúng một lần.
- **Độ chính xác của các giá trị đưa vào CRF** = `T / P`. **Tỷ lệ thu đủ và đúng giá trị cần điền** = `T / E`. **Điểm khớp nghiêm ngặt** = `200 × T / (E + P)`. Báo `T`, `E`, `P` cùng điểm. Nếu `E + P = 0`, ghi *không áp dụng*. Các tỷ lệ riêng có mẫu số 0 cũng ghi *không áp dụng*.
- Báo điểm vị trí riêng. Nếu cần so một lượt cũ chưa hỗ trợ tọa độ với lượt mới, ghi độ phủ tọa độ của lượt cũ và so điểm CRF trong phạm vi thuộc tính chung. Báo riêng tỷ lệ vị trí đúng của lượt mới trên bộ có nhãn vị trí.
- Chấm ở ba mốc **JSON gốc**, **sau chuẩn hóa**, **giá trị hiện trên UI**. Việc một hàng bị tách thành số đo và `%Pre` chỉ đổi đơn vị đếm ở bước UI. Gắn lỗi vào công đoạn phát sinh để thấy model đọc sai hay bộ chuyển đổi gán sai.

Phân loại lỗi để duyệt theo giá trị, không dùng điểm tổng để bỏ qua lỗi cụ thể. Sai số, sai dấu, sai mã/component, sai dòng, tự điền giá trị hoặc nhập trùng cần được giữ để đối chiếu. Kiểu chữ sai được ghi riêng khi grade và quan hệ với kết quả vẫn đúng. Ngày nguồn thiếu cần xử lý trước khi dùng kết quả cho phân tích theo lần đo. Giữ nhóm kiểm lại các ca dễ nhầm gồm Hb/không Hb, Pre/Post, Class `o/0`, grade gần ghi chú và nhãn giống nhau ở nhiều panel.

## Áp dụng lại cho lượt Terra 5.6

| Phạm vi đã chấm | Kết quả | Giải thích |
|---|---:|---|
| Số đo và phần trăm trên phiếu | **178/178** | Gồm cả hàng ngoài CRF. |
| Hàng dự kiến thuộc CRF, đúng nội dung và gán mã theo bộ chấm cũ | **131/131** | Tỷ lệ thu đủ và đúng trên các hàng cần điền. |
| Hàng được Terra đưa vào CRF, cùng phạm vi bộ chấm cũ | **131/133** | Hai hàng Kco/Tlco không Hb bị đưa vào mã có Hb. |
| Điểm khớp nghiêm ngặt ở cấp hàng, theo các thuộc tính bộ chấm cũ | **99,2/100** | `200 × 131 / (131 + 133)`. Phạm vi này chưa có phép chấm kiểu chữ, ngày và vị trí. |
| Ứng viên CRF trên UI đã đối chiếu giá trị, mã và chú thích liên quan | **154/159 (96,9%)** | 147 giá trị Terra và 12 giá trị OCR tại máy. Giữ 4 giá trị do hai hàng nhầm mã, và 1 giá trị ANA do kiểu chữ. Đây là tỷ lệ đạt trong số ứng viên UI đã xem xét. |
| Ngày nguồn / tọa độ hàng trên UI | **0/159 giá trị có ngày nguồn** và **chưa có tọa độ LLM** | Báo độ phủ riêng. Chưa có điểm đúng vị trí cho lượt này. |

Lượt Terra là đường cơ sở trên bộ đã dùng phát triển. Quyết định duyệt nguồn giúp truy lại các ứng viên đã được chấp thuận. Khi cần gắn một tỷ lệ tin cậy cho từng nhóm kết quả, hãy đo tỷ lệ đúng của nhóm trên hồ sơ mới có đáp án được người duyệt xác nhận. Lấy mẫu cả nhóm có cờ và nhóm ít cờ để tìm lỗi mà quy tắc bỏ sót.

Nguồn đối chiếu cục bộ gồm [kết quả chấm theo hàng](research/terra56-generic-rerun-20261111-01/final/assessment.json), [đối chiếu từng giá trị CRF](research/terra56-crf-assistant-review-20261111-01.json) và [biên nhận duyệt nguồn](research/terra56-crf-source-approval-20261111-01/receipt.json). Tài liệu tham khảo về cách chọn chỉ số là [Langfuse Academy](https://langfuse.com/academy/evaluate/choosing-what-to-evaluate).
