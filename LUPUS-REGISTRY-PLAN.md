# Kế hoạch xây dựng registry bệnh nhân lupus

> **Yêu cầu bảo mật hiện hành:** dùng server nội bộ có GPU NVIDIA; model OCR, file, dữ liệu và đối chiếu đều ở nội bộ. Xem [phương án kỹ thuật](./OCR-TECHNICAL-PROPOSAL.md). Không dùng dịch vụ OCR/AI cloud cho hồ sơ trong phạm vi hiện tại.

> **Phạm vi mới nhất 05/11/2026 theo xác nhận lại:** Word đã lọc ngoài lupus là nguồn xác định bộ trường nghiệp vụ. Giai đoạn hiện tại triển khai **OCR → pool dữ liệu có cấu trúc**, theo [đặc tả hiện hành](./OCR-TO-CRF-SPEC.md), [hợp đồng pool](./OCR-DATA-POOL-CONTRACT.md) và [lịch 6 tuần](./IMPLEMENTATION-TIMELINE.md). Hệ thống lưu trữ phía sau tiếp nhận pool và có thể xuất Word; OCR không trực tiếp điền mẫu. Nội dung registry bên dưới giữ làm định hướng hệ thống phía sau. Không mở rộng lại bộ trường từ ảnh output.

Ngày cập nhật: 05/11/2026  
Trạng thái: Bản kế hoạch đề xuất, tiếp tục hoàn thiện trước khi triển khai.

## 1. Mục tiêu và thông tin đã xác nhận

Xây dựng hệ thống thu thập, lưu trữ và chuẩn hóa hồ sơ bệnh nhân lupus theo thời gian. Mục tiêu trước mắt là hình thành nguồn dữ liệu sạch, có thể kiểm chứng và truy ngược về hồ sơ gốc để phục vụ quản lý bệnh nhân.

Thông tin người dùng đã xác nhận:

- Bệnh nhân có thể gửi file văn bản, ảnh kết quả xét nghiệm, báo cáo y tế, hồ sơ bệnh án và các tài liệu, hình ảnh liên quan.
- Dữ liệu cần được tích lũy theo thời gian để quản lý diễn tiến bệnh.
- Ưu tiên hiện tại là hoàn thiện dữ liệu sạch.
- Phân tích biểu đồ, histogram và AI hỗ trợ đánh giá xét nghiệm, điều trị là hướng phát triển về sau.
- Nhóm có một bác sĩ lâm sàng; các vai trò nhân sự khác chưa được xác định.
- Quy mô thử nghiệm dưới 1.000 bệnh nhân.
- Quy mô sau thử nghiệm dự kiến trên 20.000 bệnh nhân.
- Xây hệ thống riêng, tham khảo mô hình công khai của CURE (urticaria-registry.com), theo xác nhận bổ sung của người dùng.
- Theo yêu cầu cập nhật: triển khai đợt đầu trong 6 tuần, tập trung quản lý dữ liệu và ưu tiên OCR; nhập tay dùng để sửa hoặc bổ sung phần chưa đọc được.

Người dùng đã xác nhận Word được lọc các phần không thuộc lupus. Dùng toàn bộ trường còn lại trong Word làm chuẩn cho OCR; không mở rộng lại theo ảnh output.

Tài liệu tham khảo trong dự án: [Biểu mẫu CRF SLE](./260825_Vivi_MDDU_CRF_SLE_AI%20thực%20chiến.docx). Nội dung có các nhóm tiền sử, thuốc, biểu hiện cơ quan, xét nghiệm, EULAR/ACR và SLEDAI-2K. Bác sĩ cần rà soát biểu mẫu trước khi chuyển thành từ điển dữ liệu và quy tắc hệ thống.

## 2. Phạm vi giai đoạn đầu

Hệ thống cần hỗ trợ:

1. Tạo và quản lý hồ sơ bệnh nhân bằng mã registry ổn định.
2. Nhận nhiều tài liệu trong một lần gửi, cho phép bổ sung hồ sơ cũ hoặc mới.
3. Lưu bản gốc và thông tin nguồn của từng tài liệu.
4. Trích xuất nội dung bằng công cụ đọc văn bản, OCR và AI hỗ trợ.
5. Chuẩn hóa xét nghiệm, thuốc, ngày tháng và thông tin lâm sàng.
6. Đối chiếu, sửa và xác nhận dữ liệu trước khi sử dụng theo trạng thái kiểm chứng.
7. Xem diễn tiến bệnh nhân theo thời gian.
8. Theo dõi hồ sơ còn thiếu, khó đọc, trùng hoặc mâu thuẫn.
9. Xuất dữ liệu có cấu trúc kèm nguồn, trạng thái và phiên bản.

Các chức năng phân tích nâng cao, diễn giải hình ảnh và đề xuất xét nghiệm hoặc điều trị được phát triển ở giai đoạn sau. Nền dữ liệu ban đầu cần lưu đủ nguồn và ngữ cảnh để hỗ trợ các hướng này.

## 3. Định nghĩa dữ liệu sạch

Dữ liệu sạch là dữ liệu đúng bệnh nhân, đúng nguồn, đúng thời điểm, đúng ý nghĩa và đơn vị, có trạng thái kiểm chứng rõ ràng.

Một bản ghi có thể còn thiếu thông tin nhưng vẫn được lưu nếu mức độ thiếu được thể hiện rõ. Không tự suy đoán để lấp đầy dữ liệu.

Phân biệt các trạng thái kiểm chứng:

- Chưa đối chiếu: dữ liệu máy trích xuất hoặc người dùng nhập, chưa được kiểm tra với nguồn.
- Đã đối chiếu nguồn: thông tin đã được kiểm tra là phản ánh đúng tài liệu gốc.
- Đã đánh giá chuyên môn: thông tin hoặc cách diễn giải đã được bác sĩ đánh giá, trong phạm vi được ghi nhận.
- Cần làm rõ: thông tin thiếu, khó đọc hoặc mâu thuẫn, chưa đủ cơ sở xác nhận.

Độ tin cậy do OCR/AI tự đánh giá không thay thế các trạng thái kiểm chứng trên. Việc đọc đúng một kết quả xét nghiệm không tự tạo thành kết luận lâm sàng.

## 4. Cách tiếp cận đề xuất

| Phương án | Ưu điểm | Đánh đổi |
| --- | --- | --- |
| Nhập liệu thủ công theo biểu mẫu | Dễ khởi động và kiểm soát | Khối lượng nhập liệu tăng theo hồ sơ |
| OCR/AI hỗ trợ, con người duyệt | Giảm nhập liệu, giữ khả năng đối chiếu nguồn | Cần công cụ duyệt và đo chất lượng tốt |
| Tự động hóa gần như toàn bộ | Giảm thao tác khi vận hành ổn định | Chất lượng khó bảo đảm với tài liệu đa dạng ban đầu |

Theo yêu cầu người dùng, ưu tiên OCR/trích xuất ngay khi tải hồ sơ; con người đối chiếu, sửa và xác nhận dữ liệu. Nhập tay dùng để sửa hoặc bổ sung phần chưa đọc được. Đợt đầu tập trung quản lý dữ liệu và OCR bảng xét nghiệm, dùng công cụ có sẵn và mở rộng loại hồ sơ theo chất lượng đo được.

Trong pilot, toàn bộ dữ liệu dùng làm dữ liệu đã xác minh cần được đối chiếu với nguồn. Chỉ cân nhắc tự động chấp nhận một số loại dữ liệu sau khi có kết quả đánh giá độc lập, quy tắc rõ ràng và thống nhất với người phụ trách chuyên môn.

## 5. Ba lớp dữ liệu

| Lớp | Nội dung | Mục đích |
| --- | --- | --- |
| Hồ sơ gốc | File, người gửi, thời điểm gửi, nguồn phát hành, dấu nhận diện file trùng | Giữ bằng chứng và hỗ trợ xử lý lại |
| Dữ liệu trích xuất | Văn bản OCR, trường máy đọc, vị trí trên trang, phiên bản công cụ | Làm bản nháp chờ kiểm tra |
| Dữ liệu chuẩn hóa | Bản ghi có cấu trúc, trạng thái kiểm chứng, người duyệt, lịch sử sửa | Phục vụ quản lý và tạo bộ dữ liệu phân tích |

Yêu cầu xuyên suốt:

- Mỗi dữ liệu chuẩn hóa có liên kết về tài liệu, trang và vị trí bằng chứng khi định dạng cho phép.
- Giữ giá trị gốc song song với giá trị đã chuẩn hóa.
- Mọi sửa đổi có người sửa, thời điểm và lý do.
- Chạy lại OCR/AI tạo bản đề xuất mới, không tự ghi đè dữ liệu đã duyệt.
- File gốc được bảo toàn trong thời gian lưu trữ; việc xóa hoặc hạn chế truy cập tuân theo chính sách đã xác định.

## 6. Quy trình xử lý hồ sơ

Luồng chính: Gửi hồ sơ → kiểm tra → phân loại → trích xuất → chuẩn hóa → đối chiếu → cập nhật dòng thời gian.

### 6.1 Tiếp nhận

- Cho tải nhiều file cùng lúc, hiển thị tiến độ và khả năng thử lại.
- Cho xem trước và bổ sung mô tả, cơ sở khám, ngày liên quan nếu biết.
- Gắn mã bệnh nhân và mã lô gửi.
- Kiểm tra định dạng, dung lượng, file lỗi, chất lượng ảnh và dấu hiệu thiếu trang.
- Hỗ trợ tải lại sau gián đoạn mà không tạo tài liệu trùng.

### 6.2 Kiểm tra và phân loại

- Phát hiện file trùng và tài liệu có thể thuộc bệnh nhân khác.
- Giữ tài liệu nghi ngờ trong trạng thái cần làm rõ trước khi nhập vào dữ liệu của bệnh nhân.
- Phân loại xét nghiệm, đơn thuốc, báo cáo khám, giấy ra viện, giải phẫu bệnh, hình ảnh và tài liệu khác.
- Cho phép một file chứa nhiều loại tài liệu và nhiều mốc thời gian.

### 6.3 Trích xuất và chuẩn hóa

- Ưu tiên lấy chữ có sẵn trong PDF hoặc file văn bản; dùng OCR cho ảnh.
- Lưu kết quả trích xuất, vị trí bằng chứng và phiên bản công cụ.
- Ánh xạ tên xét nghiệm, tên thuốc, đơn vị và ngày tháng theo từ điển có phiên bản.
- Đánh dấu phần khó đọc, thiếu thông tin hoặc có khả năng mâu thuẫn.
- Hình ảnh lâm sàng và ảnh chẩn đoán được lưu cùng mô tả, thời điểm và nguồn; diễn giải bằng AI là hướng về sau.

### 6.4 Đối chiếu và công bố dữ liệu

- Hiển thị hồ sơ gốc cạnh dữ liệu trích xuất.
- Cho người duyệt sửa, xác nhận hoặc yêu cầu bổ sung từng trường.
- Phân biệt đối chiếu đúng tài liệu với đánh giá chuyên môn.
- Dữ liệu được đưa vào dòng thời gian cùng trạng thái kiểm chứng.
- Các bộ dữ liệu phân tích phải có quy tắc lựa chọn trạng thái dữ liệu rõ ràng.

## 7. Bộ dữ liệu cốt lõi

Chuyển CRF thành từ điển dữ liệu có phiên bản. Mỗi trường có định nghĩa, kiểu dữ liệu, đơn vị, giá trị cho phép, nguồn, quy tắc kiểm tra và yêu cầu kiểm chứng.

| Nhóm | Nội dung chính |
| --- | --- |
| Bệnh nhân | Mã registry, thông tin nền cần thiết, trạng thái chẩn đoán và nguồn xác nhận |
| Định danh và liên hệ | Thông tin nhận diện cần thiết, quản lý quyền truy cập riêng |
| Đồng ý tham gia | Phạm vi sử dụng, thời điểm, phiên bản nội dung đồng ý, thay đổi hoặc rút lại |
| Tài liệu | File gốc, loại tài liệu, cơ sở phát hành, ngày, người gửi, trạng thái xử lý |
| Lần khám và sự kiện | Ngày hoặc khoảng thời gian, cơ sở khám, nhập viện, xuất viện |
| Xét nghiệm | Tên gốc/chuẩn, kết quả, đơn vị, khoảng tham chiếu, mẫu bệnh phẩm, phương pháp nếu có |
| Thuốc | Tên, hàm lượng, liều mỗi lần, tần suất, đường dùng, thời gian, nguồn thông tin |
| Lâm sàng | Triệu chứng, biểu hiện cơ quan, tiền sử, bệnh đồng mắc, thời điểm và nguồn |
| Đánh giá bệnh | Điểm ghi nhận, ngày đánh giá, người đánh giá, phiên bản thang điểm |
| Kiểm chứng | Trạng thái, người duyệt, thời điểm, thông tin thiếu, mâu thuẫn và lịch sử sửa |

Ưu tiên triển khai xét nghiệm, thuốc và lần khám trước, sau đó mở rộng biểu hiện cơ quan theo CRF đã rà soát.

### Quy tắc chuẩn hóa quan trọng

1. Tách ngày tải lên, ngày khám, ngày lấy mẫu, ngày trả kết quả và ngày phát hành tài liệu.
2. Giữ độ chính xác của thời gian: chỉ biết tháng/năm thì không tự thêm ngày.
3. Chỉ chuyển đơn vị khi có đủ thông tin và quy tắc hợp lệ; lưu công thức hoặc quy tắc chuyển đổi.
4. Giữ đúng kết quả dạng số, dấu nhỏ hơn/lớn hơn, âm/dương tính, hiệu giá, khoảng và văn bản.
5. Phân biệt không có, chưa làm, không ghi nhận và không đọc được.
6. Tách thuốc được kê với thuốc bệnh nhân tự khai thực tế đang dùng.
7. Tách thông tin bệnh nhân tự khai với thông tin ghi nhận trong tài liệu chuyên môn.
8. Giữ các nguồn mâu thuẫn và ghi rõ cách giải quyết.
9. Nhận diện cùng một xét nghiệm được nhắc lại trong nhiều tài liệu để tránh đếm trùng.
10. Giữ bối cảnh cơ sở xét nghiệm, phương pháp và khoảng tham chiếu khi có; việc cùng tên chưa bảo đảm kết quả có thể so sánh trực tiếp.
11. Liên kết bản ghi sửa đổi hoặc thay thế với bản ghi trước đó để giữ lịch sử.

EULAR/ACR và SLEDAI-2K trước mắt được lưu như thông tin có nguồn. Chức năng tự tính điểm cần đặc tả và kiểm chứng riêng về điều kiện áp dụng, cửa sổ thời gian, dữ liệu đầu vào và phiên bản. Chẩn đoán, phân loại bệnh và mức độ hoạt động bệnh là các thông tin riêng biệt.

## 8. Nhân sự và quy trình duyệt

Thông tin đã biết: nhóm có một bác sĩ lâm sàng. Vai trò cụ thể và thời gian có thể tham gia của bác sĩ cần thống nhất.

Phân công đề xuất:

| Vai trò | Trách nhiệm |
| --- | --- |
| Bệnh nhân hoặc người được ủy quyền | Gửi hồ sơ, bổ sung thông tin, phản hồi yêu cầu làm rõ |
| Nhân sự đối chiếu nếu được bố trí | Kiểm tra chữ, số, đơn vị, ngày và nguồn; chuyển ca cần diễn giải cho bác sĩ |
| Bác sĩ lâm sàng | Rà soát từ điển, quy tắc, kiểm tra chất lượng và đánh giá chuyên môn |
| Người vận hành hệ thống | Quản lý tài khoản, lỗi xử lý, sao lưu và giám sát vận hành theo quyền |

Không mặc định nhóm đã có nhân sự đối chiếu hoặc vận hành. Nếu một bác sĩ phải đảm nhiệm toàn bộ việc duyệt, tốc độ nhận hồ sơ cần bám theo năng lực thực tế.

Pilot cần đo thời gian trên mỗi tài liệu, mỗi bệnh nhân, tỷ lệ chuyển bác sĩ và lượng tồn. Từ đó ước lượng nhân sự cần thiết khi mở rộng trên 20.000 bệnh nhân.

## 9. Kiến trúc đề xuất và khả năng mở rộng

- Web sử dụng tốt trên điện thoại cho người gửi hồ sơ.
- Giao diện quản trị và đối chiếu dữ liệu cho nhóm phụ trách.
- PostgreSQL lưu dữ liệu có cấu trúc, quan hệ nguồn và lịch sử thay đổi.
- Kho lưu trữ đối tượng riêng cho tài liệu, có phân quyền và truy cập giới hạn thời gian.
- Hàng đợi và tiến trình nền xử lý OCR/AI, hỗ trợ thử lại và theo dõi lỗi.
- Nhật ký truy cập, chỉnh sửa, duyệt và xuất dữ liệu.
- Sao lưu cơ sở dữ liệu và file, có kiểm tra khôi phục.

Đây là kiến trúc đề xuất để thẩm định khi chốt thiết kế. Quy mô trên 20.000 bệnh nhân chưa tự nó yêu cầu microservices. Khối lượng file, số trang, lượt gửi đồng thời và chi phí OCR/AI sẽ quyết định năng lực xử lý.

Ví dụ lập kế hoạch, chưa phải dự báo thực tế: 20.000 bệnh nhân × 50 tài liệu qua nhiều năm tương đương 1.000.000 tài liệu. Cần đo số trang, dung lượng và tần suất bổ sung trong pilot để lập ngân sách.

Các chỉ số vận hành cần theo dõi:

- Số tài liệu, trang và dung lượng trên mỗi bệnh nhân.
- Lượt tải lên và tốc độ phát sinh hồ sơ.
- Thời gian chờ, thời gian xử lý và tỷ lệ lỗi.
- Chi phí OCR/AI, lưu trữ và đối chiếu.
- Lượng hồ sơ tồn và thời gian xử lý yêu cầu bổ sung.

## 10. Quyền truy cập và quản lý dữ liệu

- Phân quyền bệnh nhân, người được ủy quyền, người đối chiếu, bác sĩ, quản trị và người phân tích theo nhu cầu.
- Thông tin định danh có quyền truy cập riêng; bộ dữ liệu phân tích dùng mã registry.
- Mã hóa dữ liệu khi truyền và khi lưu, bảo vệ khóa và thông tin đăng nhập.
- Ghi nhận truy cập và xuất dữ liệu.
- Xác định phạm vi đồng ý tham gia, chính sách lưu trữ, sửa, xóa và xử lý khi rút lại đồng ý.
- Chốt nơi lưu trữ và điều kiện sử dụng dịch vụ OCR/AI bên ngoài trước khi xử lý hồ sơ thật.
- Xác định trách nhiệm quản lý dữ liệu và yêu cầu áp dụng tại nơi triển khai.

Chưa xác định registry do một đơn vị quản lý hay nhiều bệnh viện/phòng khám cùng tham gia. Điểm này ảnh hưởng tới quyền truy cập giữa đơn vị, cách nhận diện bệnh nhân trùng và trách nhiệm quản lý dữ liệu.

## 11. Lộ trình triển khai

Kế hoạch thực hiện chi tiết: [Timeline 6 tuần: quản lý dữ liệu và OCR](./IMPLEMENTATION-TIMELINE.md). Lịch này thay thế lịch 12 tuần và khoảng ước lượng 8–13 tuần trước đó theo yêu cầu người dùng. Tuần 1 bắt đầu khi có kỹ sư và mẫu được phép sử dụng.

| Tuần | Trọng tâm | Đầu ra |
| --- | --- | --- |
| 1 | Từ điển và mô hình dữ liệu; thử OCR ngay trên mẫu | Thiết kế v1; chọn công cụ; đọc và lưu được một file |
| 2 | Kho bệnh nhân/tài liệu và OCR hàng loạt | Tải nhiều file, chống trùng, trạng thái/lỗi/thử lại, chữ theo trang |
| 3 | Trích xuất dữ liệu có cấu trúc và chuẩn hóa | Xét nghiệm, thuốc, ngày và bằng chứng nguồn ở trạng thái nháp |
| 4 | Đối chiếu và quản lý dữ liệu | Sửa/duyệt, lịch sử, tìm/lọc, dòng thời gian cơ bản, xuất CSV |
| 5 | Chạy thử thực tế và sửa lỗi | Đối chiếu dữ liệu, báo cáo lỗi theo trường, đo thời gian và chi phí |
| 6 | Đánh giá độc lập, kiểm tra vận hành và bàn giao | Bản pilot, bộ dữ liệu có nguồn, báo cáo chất lượng, hướng dẫn và khôi phục thử |

Phạm vi đợt đầu ưu tiên nhóm vận hành registry và OCR xét nghiệm; đơn thuốc và thông tin hành chính được mở rộng theo mẫu thực tế. Cổng bệnh nhân tự đăng ký, biểu đồ nâng cao và tích hợp bệnh viện nằm ở đợt sau. Nhập tay dùng cho sửa/bổ sung phần chưa đọc được.

### Mở rộng pilot theo từng đợt

1. Dùng dữ liệu giả lập hoặc bộ hồ sơ được phép sử dụng để kiểm tra luồng đầu cuối.
2. Trong 6 tuần, mục tiêu vận hành đề xuất là khoảng 20–30 bệnh nhân và tổng 100–200 tài liệu, có mẫu đa dạng về nguồn, định dạng và chất lượng; giữ riêng 30–50 tài liệu để đánh giá cuối kỳ.
3. Đo độ chính xác, dữ liệu bỏ sót, thời gian duyệt, chi phí và lượng tồn.
4. Hiệu chỉnh từ điển, quy tắc, công cụ trích xuất và màn hình đối chiếu.
5. Tăng dần trong phạm vi dưới 1.000 bệnh nhân khi đạt tiêu chí đã thống nhất.
6. Lập phương án nhân sự, chi phí và kiểm tra tải theo khối lượng dự kiến trước khi mở rộng trên 20.000 bệnh nhân.

Số bệnh nhân trong từng đợt là đề xuất vận hành. Đánh giá chất lượng phải xét số trường, số trang và từng nhóm tài liệu, tránh dùng số bệnh nhân làm thước đo duy nhất.

## 12. Tiêu chí hoàn thành giai đoạn dữ liệu sạch

Các ngưỡng định lượng cần được thống nhất với người phụ trách chuyên môn trước khi đánh giá pilot.

- Mọi dữ liệu mang trạng thái đã đối chiếu có nguồn và thông tin người duyệt.
- Dựng được diễn tiến đúng từ tài liệu được gửi không theo thứ tự thời gian.
- Xử lý được file trùng, kết quả nhắc lại, ảnh mờ, thiếu ngày, thiếu đơn vị và nguồn mâu thuẫn.
- Đánh giá trên bộ hồ sơ tham chiếu được kiểm tra độc lập; tách khỏi dữ liệu dùng để hiệu chỉnh công cụ.
- Đo độ chính xác và mức bỏ sót theo từng trường quan trọng: bệnh nhân, ngày, tên xét nghiệm, giá trị, đơn vị và liều thuốc.
- Đo tỷ lệ thiếu, tỷ lệ cần làm rõ, thời gian duyệt và lượng hồ sơ tồn.
- Xuất được dữ liệu kèm thời gian, đơn vị, nguồn, trạng thái và phiên bản; có quy tắc chống đếm trùng.
- Xác nhận quyền truy cập đúng vai trò và kiểm tra khôi phục sao lưu thành công.
- Kiểm tra hệ thống theo tải tài liệu, dung lượng và mức đồng thời dự kiến của giai đoạn mở rộng.

## 13. Hướng phát triển sau khi nền dữ liệu ổn định

1. Thống kê mô tả, histogram và phân bố theo nhóm bệnh nhân.
2. Biểu đồ diễn tiến xét nghiệm, điều trị và hoạt động bệnh theo thời gian.
3. Tạo nhóm nghiên cứu và xuất dữ liệu theo tiêu chí có phiên bản.
4. AI hỗ trợ tóm tắt hồ sơ và phát hiện thông tin cần làm rõ.
5. Công cụ hỗ trợ đánh giá xét nghiệm hoặc điều trị, sau khi có đặc tả chuyên môn, nguồn tham chiếu và đánh giá phù hợp mục đích sử dụng.

Khi phân tích cần phân biệt đơn vị đếm là bệnh nhân, lần khám hay kết quả xét nghiệm; xét đến kết quả lặp lại, đơn vị, phương pháp và dữ liệu thiếu.

## 14. Những điểm cần thống nhất tiếp

1. Registry do một đơn vị quản lý hay nhiều bệnh viện/phòng khám cùng tham gia?
2. Phạm vi bệnh nhân là SLE hay gồm các thể lupus/bệnh tự miễn khác?
3. Một bác sĩ có thể dành bao nhiêu thời gian cho xây quy tắc và duyệt dữ liệu? Có nhân sự đối chiếu hỗ trợ không?
4. Bệnh nhân tự gửi trực tiếp hay thông qua nhóm nghiên cứu/đơn vị y tế? Có người đại diện không?
5. Bộ trường bắt buộc của phiên bản đầu và tiêu chí đưa bệnh nhân vào registry là gì?
6. Khối lượng hồ sơ lịch sử, ngôn ngữ, định dạng và tần suất bổ sung dự kiến ra sao?
7. Môi trường lưu trữ, ngân sách, nơi lưu dữ liệu và dịch vụ OCR/AI được phép sử dụng là gì?
8. Tiêu chí chất lượng, chính sách sử dụng dữ liệu, quyền truy cập và lưu/xóa dữ liệu cần áp dụng là gì?

## 15. Công việc ưu tiên tiếp theo

Tài liệu triển khai riêng: [Thiết kế kho dữ liệu: công cụ, trường ưu tiên và thuật toán xử lý](./DATA-REPOSITORY-DESIGN.md).

Trong tuần 1, hoàn thiện từ điển dữ liệu v1 và mô hình dữ liệu song song với thử OCR trên mẫu. Cuối tuần phải đọc và lưu được nguồn của một file; tuần 2 mở thành kho bệnh nhân/tài liệu có OCR hàng loạt. Quy trình đối chiếu và tiêu chí chất lượng được chốt cùng bộ trường ưu tiên.

## 16. Tài liệu phân tích dữ liệu

Đã lập [Phân tích trường dữ liệu từ CRF](./CRF-DATA-ANALYSIS.md), gồm danh mục theo nguồn, cấu trúc lặp theo thời gian, mức bắt buộc đề xuất, dữ liệu bổ sung cho registry và các điểm cần bác sĩ rà soát. Tài liệu này làm đầu vào cho từ điển dữ liệu v1; các quyết định chuyên môn và bộ trường bắt buộc theo đề cương vẫn cần thống nhất.

Tra cứu thuật ngữ tại [Giải nghĩa ký hiệu](./GLOSSARY.md), gồm mã nội bộ, kiểu dữ liệu, chữ viết tắt y khoa, đơn vị và thuật ngữ kỹ thuật.

## 17. Kết quả khảo sát bệnh viện và mô hình CURE

Đã lập [Khảo sát hồ sơ bệnh viện Việt Nam và mô hình CURE](./HOSPITAL-FORMS-AND-CURE-RESEARCH.md), phân biệt mẫu phiếu công khai, mô tả ứng dụng, tài liệu yêu cầu phần mềm và đề xuất của dự án.

Định hướng đề xuất sau khảo sát:

- Có hồ sơ ban đầu, các lần theo dõi, phần bệnh nhân tự khai, phần bác sĩ và kết quả xét nghiệm lặp theo thời gian.
- Kết hợp biểu mẫu có cấu trúc với kho tài liệu gốc, OCR/trích xuất, đối chiếu và truy nguồn từng trường.
- Giữ mã theo cơ sở cấp, phân biệt bệnh viện phát hành và phòng xét nghiệm thực hiện.
- Giữ thông tin phương pháp, máy/kit, đơn vị, khoảng tham chiếu, nguồn xác định và mức có thể so sánh.
- Không tự suy phương pháp chắc chắn từ đơn vị hoặc áp dụng phương pháp hiện tại cho hồ sơ cũ.
- Kiểm chứng bằng tài liệu thực tế được phép dùng của từng loại/phiên bản; các nguồn công khai hiện chưa đủ để xác nhận bộ đọc cho mọi bệnh viện.

Lịch theo dõi lupus, công nghệ cụ thể và bộ trường bắt buộc vẫn cần chốt. Tham khảo CURE không đồng nghĩa sử dụng REDCap/secuTrial hoặc sao chép bộ câu hỏi về mày đay.
