# Khảo sát hồ sơ bệnh viện Việt Nam và mô hình CURE

Ngày khảo sát: 04/11/2026  
Mục đích: xác định cách tiếp nhận hồ sơ từ nhiều bệnh viện và vận dụng mô hình registry CURE cho hệ thống lupus riêng.  
Quy mô mục tiêu đã biết: thử nghiệm dưới 1.000 bệnh nhân, mở rộng trên 20.000; nhóm có một bác sĩ lâm sàng.

Người dùng đã xác nhận: tham khảo mô hình công khai của CURE để xây hệ thống riêng. Không mặc định nhóm có tài khoản nội bộ, quyền sử dụng biểu mẫu, mã nguồn hoặc kết nối dữ liệu CURE.

## 1. Kết quả chính

1. CURE cung cấp mô hình tham khảo phù hợp về phân vai bệnh nhân/bác sĩ và theo dõi theo thời gian. Trang tham gia phân biệt REDCap cho luồng trực tuyến với secuTrial cho luồng cổ điển. [Nguồn C2](https://urticaria-registry.com/for-participants/)
2. Tìm được hai mẫu phiếu kết quả công khai trên VinmecDr, có trường kỹ thuật xét nghiệm và thông tin mẫu. Đây là mẫu di truyền chuyên sâu, không phải bộ phiếu thường quy hoặc phiếu lupus. [Nguồn V1](https://vinmecdr.com/storage/2022/06/Phu-luc-2_-Phieu-tra-ket-qua-xet-nghiem-1.pdf), [V2](https://vinmecdr.com/storage/2022/06/Phu-luc-2_-Phieu-tra-ket-qua-xet-nghiem.pdf)
3. Với Bạch Mai, Việt Đức và Chợ Rẫy, nguồn chính thức tìm được chủ yếu là hướng dẫn hồ sơ điện tử hoặc tài liệu yêu cầu phần mềm. Chưa xác minh được một bộ mẫu phiếu kết quả xét nghiệm thường quy đầy đủ cho từng bệnh viện trong phạm vi khảo sát này.
4. Kiến trúc đề xuất cho lupus gồm hai luồng bổ sung nhau: dữ liệu có cấu trúc từ biểu mẫu và hồ sơ lịch sử từ file. Chúng hội tụ vào dữ liệu có nguồn, thời gian và trạng thái kiểm chứng. Đây là đề xuất cho dự án, không phải chức năng đã được xác nhận trên CURE.
5. Mẫu giấy giúp đọc bố cục và tìm nhãn phương pháp; khả năng so sánh kết quả còn phải xét loại mẫu, đơn vị, phương pháp, thời điểm và thông tin phòng xét nghiệm. Không lấy tên bệnh viện hoặc logo làm bằng chứng rằng hai kết quả tương đương.

## 2. Mức độ bằng chứng và giới hạn

| Nhãn | Cách sử dụng trong báo cáo |
| --- | --- |
| Mẫu công khai đọc được | Có phiếu mẫu cụ thể và đọc được nội dung bằng công cụ web |
| Mô tả chính thức | Đơn vị công bố tính năng/quy trình, chưa kiểm thử ứng dụng hoặc xác nhận cấu trúc file xuất |
| Tài liệu yêu cầu | Đặc tả/yêu cầu trong hồ sơ phần mềm, không chứng minh mọi tính năng đã triển khai |
| Nội dung được lập chỉ mục | Đọc được đoạn văn bản qua công cụ tìm kiếm, chưa đọc/kiểm tra đầy đủ file trực tiếp |
| Đề xuất | Suy luận hoặc phương án của dự án, cần kiểm chứng bằng mẫu và thử nghiệm |

Đã ưu tiên website bệnh viện, tài liệu của đơn vị công bố và website CURE. Không dùng các hồ sơ có thông tin bệnh nhân trên website chia sẻ tài liệu làm bộ mẫu chuẩn. Chưa thu thập hoặc sao chép bộ dữ liệu bệnh nhân thật từ các cổng tra cứu.

Một số đường dẫn PDF/trang trả timeout không ổn định. Đọc được phần văn bản của hai mẫu Vinmec; công cụ chụp trang PDF không thành công nên chưa xác minh bố cục trực quan. Hướng dẫn REDCap của CURE đọc được các đoạn đã lập chỉ mục; chưa xác minh đầy đủ cả 11 trang. Khu Members Area chưa truy cập thành công. Chưa kiểm thử quy trình bên trong REDCap/secuTrial hoặc ứng dụng bệnh viện.

Ngày truy cập khác với ngày phát hành và phiên bản biểu mẫu. Các mẫu tìm được không bảo đảm là phiên bản đang dùng tại mọi cơ sở của cùng hệ thống bệnh viện.

## 3. Vinmec

### 3.1 Các mẫu tìm được

| Mẫu | Bằng chứng đọc được | Giới hạn |
| --- | --- | --- |
| V1: Phiếu XP-013, hai trang | Nhãn PID/SID/LID, thông tin người bệnh, mẫu, các mốc thời gian, kỹ thuật Sanger, kết quả mô tả và phòng xét nghiệm ngoài | Mẫu liên quan Rett, không phải phiếu SLE/thường quy |
| V2: Phiếu XP-006, hai trang | Kỹ thuật PCR + reverse hybridization, bộ kit, kết quả văn bản và giới hạn phát hiện | Mẫu thalassemia, không đại diện mọi phiếu Vinmec |

Nguồn: [V1 — mẫu XP-013](https://vinmecdr.com/storage/2022/06/Phu-luc-2_-Phieu-tra-ket-qua-xet-nghiem-1.pdf), [V2 — mẫu XP-006](https://vinmecdr.com/storage/2022/06/Phu-luc-2_-Phieu-tra-ket-qua-xet-nghiem.pdf). Các ký hiệu PID/SID/LID cần xác nhận ý nghĩa theo đơn vị; không tự ánh xạ chỉ từ tên viết tắt.

### 3.2 Áp dụng đề xuất

- Có trường riêng cho phương pháp được ghi trực tiếp; giữ bản nguyên văn và phần chuẩn hóa.
- Giữ từng loại mã địa phương cùng cơ sở cấp mã và loại mã đã xác nhận.
- Phân biệt thời gian lấy mẫu, nhận mẫu, xét nghiệm và trả kết quả.
- Cho phép kết quả văn bản dài và giới hạn kỹ thuật, ngoài cấu trúc kết quả số.
- Phân biệt nơi phát hành tài liệu với phòng xét nghiệm thực sự thực hiện và đơn vị chuyển gửi.
- Kiểm thử từng loại phiếu và phiên bản, không tạo một bộ đọc duy nhất dựa vào logo.

## 4. Bạch Mai

### 4.1 Nguồn chính thức tìm được

Bài ngày 25/05/2026 mô tả Bạch Mai Care lưu đơn thuốc, kết quả và lịch sử khám, đồng thời có thông báo khi đủ kết quả cận lâm sàng. Đây là mô tả chức năng, chưa phải phiếu mẫu hoặc API. [Nguồn B1](https://bachmai.gov.vn/bai-viet/app-bach-mai-care-ra-mat-tinh-nang-moi-co-du-ket-qua-dien-thoai-tu-bao-nguoi-benh-khong-con-phai-cho-doi?id=5eddba7e-d16d-4a11-8a6d-3b95202070f5)

Bài ngày 30/07/2026 mô tả trích sao hồ sơ qua ứng dụng và các loại tài liệu như giấy ra viện, tóm tắt bệnh án, giấy chuyển tuyến; có mã và trạng thái xử lý theo đợt. Nguồn cũng đề cập tài liệu ký số. Chưa kiểm tra file phát hành hoặc chữ ký cụ thể. [Nguồn B2](https://bachmai.gov.vn/bai-viet/benh-vien-bach-mai-trien-khai-trich-sao-ho-so-benh-an-truc-tuyen?id=d194e513-361e-4c35-8ca8-f8745693f163)

### 4.2 Áp dụng đề xuất

- Hỗ trợ file điện tử gốc và ảnh chụp/ảnh màn hình, giữ thông tin loại nguồn.
- Liên kết giấy khám, đơn thuốc, xét nghiệm và giấy ra viện với đợt khám/điều trị.
- Tách trạng thái “đã có file”, “đã phát hành kết quả”, “đã trích xuất” và “đã kiểm chứng”.
- Bảo toàn file có chữ ký số; trạng thái có dấu hiệu chữ ký và trạng thái đã kiểm tra chữ ký là hai thuộc tính khác nhau.
- Không mặc định ứng dụng cho phép tải file hoặc có API cho registry. Cách bệnh nhân cung cấp tài liệu cần kiểm thử thực tế.

## 5. Bệnh viện Hữu nghị Việt Đức

### 5.1 Nguồn tìm được và nhận diện đúng đơn vị

Khảo sát sử dụng `benhvienvietduc.org` của Bệnh viện Hữu nghị Việt Đức. Không gộp thông tin từ những bệnh viện khác cùng mang tên Việt Đức.

Tài liệu mời chào giá tháng 08/2024 có các yêu cầu liên quan chỉ định, kết quả, đơn thuốc, y lệnh, chẩn đoán theo giai đoạn và hồ sơ điều trị. Đây là tài liệu yêu cầu phần mềm, không phải chứng cứ kiểm thử tính năng hiện hành hoặc mẫu phiếu phát hành. [Nguồn D1 — tài liệu 3684/VĐ-CNTT](https://benhvienvietduc.org/wp-content/uploads/2024/08/Th%C6%B0-m%E1%BB%9Di-ch%C3%A0o-gi%C3%A1-3684.-V%C4%90.CNTT_.-16.8.2024.pdf)

### 5.2 Áp dụng đề xuất

- Phân loại rõ phiếu chỉ định, kết quả đã thực hiện, y lệnh và đơn thuốc.
- Tách chẩn đoán vào viện, trong điều trị và ra viện khi nguồn ghi rõ.
- Lưu thời gian bắt đầu/kết thúc đợt điều trị và các sự kiện liên quan.
- Khi gặp một kết quả được trích lại trong tóm tắt bệnh án, liên kết bằng chứng thay vì tạo phép đo mới ngay.
- Chưa có đủ căn cứ để viết bộ đọc phiếu đặc thù Việt Đức hoặc điền sẵn máy/phương pháp theo bệnh viện.

## 6. Chợ Rẫy

### 6.1 Nguồn chính thức tìm được

Trang giới thiệu ứng dụng công bố lịch sử khám, bác sĩ/chẩn đoán/lời dặn, sinh hiệu, xét nghiệm, hình ảnh/thăm dò, thủ thuật và thuốc được kê, cùng biểu đồ theo lần khám. Đây là mô tả tính năng, chưa kiểm thử đầu ra. [Nguồn R1](https://bvchoray.vn/bai-viet/2-benh-vien-cho-ray-trien-khai-ung-dung-%28app%29-bv-ch-20250813013559213.html)

Hướng dẫn sử dụng mô tả tra cứu bằng mã người bệnh/mã hồ sơ hoặc thông tin định danh, xác thực tài khoản và cảnh báo khi không khớp. [Nguồn R2](https://bvchoray.vn/bai-viet/1-huong-dan-chi-tiet-cach-su-dung-cac-tinh-nang-tren-20250820074937999.html)

### 6.2 Áp dụng đề xuất

- Giữ mã người bệnh và mã hồ sơ/lần khám như các loại mã khác nhau theo nguồn.
- Cho một tài khoản đại diện nhiều người khi có quyền, nhưng luôn yêu cầu xác định đúng người nhận dữ liệu.
- Phát hiện file có dấu hiệu thuộc thành viên khác trước khi đưa vào registry.
- Phân biệt đơn thuốc đã kê với thuốc thực tế bệnh nhân sử dụng.
- Đánh dấu bệnh viện/phương pháp trên biểu đồ, chỉ nối hoặc gộp dữ liệu theo mức tương đương đã xác nhận.
- Chưa xác minh bộ mẫu phiếu thường quy hoặc khả năng xuất PDF/API từ ứng dụng.

## 7. Nguồn bổ sung hữu ích

### 7.1 MEDLATEC

Danh mục xét nghiệm 2026 có loại mẫu, lưu ý, bảo quản và thời gian trả; có các mục albumin máu, albumin niệu và niệu 24 giờ riêng. Đây là danh mục chuyên môn công khai, không phải phiếu kết quả. [Nguồn M1](https://medlatec.vn/phu-luc-danh-muc-xet-nghiem-medlatec-2026)

Đề xuất: coi loại mẫu và điều kiện lấy mẫu là thuộc tính quan trọng của định nghĩa xét nghiệm; phiên bản hóa danh mục. Không lấy thời gian trả hoặc điều kiện trong danh mục làm dữ liệu thực tế của từng bệnh nhân nếu nguồn không ghi nhận.

### 7.2 Bệnh viện Hùng Vương

Hướng dẫn công khai mô tả QR dẫn tới đường dẫn tra cứu, tiếp tục cần thông tin xác nhận trước khi xem kết quả. [Nguồn H1](https://bvhungvuong.vn/danh-cho-benh-nhan/ung-dung-qr-code-trong-tra-cuu-ket-qua-xet-nghiem)

Đề xuất: QR là một dạng thông tin nguồn có thể chứa đường dẫn hoặc mã truy cập; không mặc định nội dung QR là dữ liệu xét nghiệm. Registry cần cơ chế kết nối được cho phép trước khi thực hiện tra cứu tự động.

## 8. CURE công bố những gì

### 8.1 Mô hình registry

Trang chủ mô tả CURE là registry quan sát, tiến cứu, quốc tế và đa trung tâm về mày đay; có luồng bệnh nhân qua QR/link từ bác sĩ và dữ liệu bác sĩ bổ sung. Website cũng công bố kết nối CRUSE cho theo dõi hằng ngày. Đây là mô tả công khai, chưa kiểm thử tích hợp. [Nguồn C1](https://urticaria-registry.com/)

Trang Key facts công bố module ban đầu cho bệnh nhân và bác sĩ, cùng theo dõi bệnh nhân định kỳ sáu tháng. Các ước lượng thời gian điền là của CURE; không dùng làm cam kết cho lupus. [Nguồn C3](https://urticaria-registry.com/key-facts/)

### 8.2 Phần công khai và phần nhập liệu

Trang For Participants dẫn tới REDCap cho bệnh nhân nhập trực tuyến rồi bác sĩ bổ sung; secuTrial phục vụ luồng giấy nhập lại. Trang cũng có tài liệu thông tin/đồng ý theo nhóm tuổi và hướng dẫn tham gia. Không có bằng chứng rằng website giới thiệu là mã nguồn hoặc bộ cài registry để tái sử dụng. [Nguồn C2](https://urticaria-registry.com/for-participants/)

Vì người dùng chọn xây hệ thống riêng, các nền tảng trên là thông tin tham khảo. Chưa chọn REDCap hoặc secuTrial làm công nghệ của dự án.

### 8.3 Cấu trúc module thể hiện trong hướng dẫn công khai

Các đoạn văn bản được lập chỉ mục của hướng dẫn V1.0 ngày 11/07/2025 liệt kê: Select Visit; Baseline Patient; FUP Patient; Baseline Physician; FUP Physician; CURE Lab. Có vai trò nhập tương ứng và hướng dẫn phân biệt bệnh nhân mới với người chuyển hệ thống. Đây chưa phải bản kiểm tra đầy đủ 11 trang hoặc danh mục trường nội bộ. [Nguồn C4 — hướng dẫn REDCap](https://urticaria-registry.com/wp-content/uploads/2025/07/Information-sheet-on-new-data-entry-via-REDCap_V1.0_EN.pdf)

Áp dụng đề xuất: khi nhập hồ sơ lupus lịch sử, giữ mã cũ và nguồn trước đây, phân biệt ngày vào registry với ngày bắt đầu bệnh hoặc khám lần đầu. Không sao chép giá trị tạm/placeholder trong hướng dẫn chuyển đổi của CURE vào quy tắc dữ liệu mới.

### 8.4 Vai trò của REDCap trong tham khảo công nghệ

Website chính thức REDCap mô tả biểu mẫu tùy biến, phân nhánh, tải file, audit trail, đa trung tâm và xuất dữ liệu. Phần mềm được cung cấp không thu phí phần mềm cho đối tác Consortium theo điều kiện của họ. Thông tin này không đồng nghĩa nhóm hiện có quyền sử dụng, hoặc triển khai/vận hành không phát sinh chi phí. [Nguồn T1](https://www.project-redcap.org/software/)

Các khả năng trên không chứng minh CURE đã cấu hình toàn bộ tính năng, đặc biệt OCR, duyệt cạnh tài liệu, truy nguồn từng trường và điều hòa khác biệt giữa phòng xét nghiệm.

## 9. Điều nên vận dụng cho registry lupus riêng

Tất cả nội dung trong phần này là đề xuất cho dự án.

| Thành phần | Cách áp dụng |
| --- | --- |
| Hồ sơ ban đầu | Ghi thông tin nền, tiền sử, bệnh đồng mắc, chẩn đoán được ghi và nguồn xác nhận |
| Các lần theo dõi | Ghi thay đổi theo mốc, không ghi đè dữ liệu trước |
| Phần bệnh nhân | Tự khai diễn tiến/thuốc thực dùng và gửi hồ sơ |
| Phần bác sĩ | Xác nhận chuyên môn và xử lý thông tin mâu thuẫn/cần diễn giải |
| Kết quả xét nghiệm | Danh sách lặp theo lần lấy mẫu, gồm đơn vị, phương pháp và nguồn |
| Lời mời qua link/QR | Liên kết đúng bệnh nhân/lần thu thập, có giới hạn quyền và thời hạn phù hợp |
| Đồng ý tham gia | Lưu phiên bản, phạm vi và người đại diện khi áp dụng |
| Nguồn và trung tâm | Ghi nơi chăm sóc, nơi phát hành và nơi thực hiện xét nghiệm riêng khi khác nhau |

Không áp dụng máy móc lịch sáu tháng của CURE cho lupus. Cần hỗ trợ cả lịch theo đề cương, lần khám phát sinh, đợt nhập viện và tải tài liệu bất cứ lúc nào.

## 10. Những phần dự án lupus cần bổ sung

| Năng lực | Nguồn xác định yêu cầu | Kết quả mong muốn |
| --- | --- | --- |
| Kho tài liệu đa định dạng | Yêu cầu ban đầu của người dùng | Giữ file gốc và hỗ trợ xử lý lại |
| Phân loại từng tài liệu/trang | Hồ sơ bệnh viện có nhiều loại nội dung | Tách xét nghiệm, đơn, báo cáo và bản trích lại |
| OCR/trích xuất có bằng chứng | Yêu cầu dữ liệu sạch | Mỗi trường liên kết về đoạn hoặc vùng nguồn |
| Duyệt cạnh tài liệu | Nhóm có bác sĩ và cần đối chiếu | Sửa, xác nhận và theo dõi tồn |
| Điều hòa dữ liệu đa nguồn | Hồ sơ từ nhiều bệnh viện/phương pháp | Giữ khác biệt và mức có thể so sánh |
| Bảo toàn lịch sử | Theo dõi dài hạn | Giữ sửa đổi, phiên bản và nguồn hiệu chỉnh |
| Phát hiện lặp/nhầm bệnh nhân | Một kết quả có thể được gửi/nhắc lại | Hỗ trợ kiểm tra trước khi gộp |
| Dữ liệu ngoài từ điển | CRF không bao hết tài liệu thực tế | Giữ chưa ánh xạ, bổ sung theo phiên bản |

Chưa có bằng chứng công khai đủ để kết luận CURE hiện có hay không có toàn bộ các năng lực này. Chúng được xác định từ mục tiêu của dự án lupus.

## 11. Yêu cầu dữ liệu bổ sung sau khảo sát

### 11.1 Quản lý mã và nguồn

- Loại mã gốc, giá trị mã, cơ sở cấp, phạm vi dùng và thời gian hiệu lực nếu biết.
- Mã người bệnh, mã hồ sơ/đợt, mã chỉ định, mã mẫu và mã báo cáo là các khái niệm riêng, chỉ ánh xạ khi có căn cứ.
- Cơ sở phát hành, đơn vị gửi mẫu và phòng xét nghiệm thực hiện riêng khi xác định được.
- Phiên bản mẫu/bố cục, mã biểu mẫu/quy trình nếu được ghi.
- Bản giấy quét, PDF điện tử, ảnh màn hình hoặc văn bản tự khai là các loại nguồn riêng.

### 11.2 Quản lý phương pháp và khả năng so sánh

- Phương pháp, máy, bộ kit, đơn vị và khoảng tham chiếu nguyên văn.
- Giá trị chuẩn hóa và quy tắc chuyển đổi có phiên bản.
- Nguồn xác định phương pháp: ghi trên phiếu, danh mục phòng xét nghiệm đã xác nhận, suy đoán hoặc chưa rõ.
- Phiên bản/ngày áp dụng của danh mục phòng xét nghiệm, tránh gán phương pháp hiện tại cho kết quả cũ.
- Mức so sánh: đủ căn cứ, có điều kiện hoặc chưa xác định tương đương; kèm lý do/người xác nhận.

Đơn vị là dấu hiệu hỗ trợ nhận diện. Các mẫu Vinmec có trường kỹ thuật riêng cho thấy cần tìm thông tin trực tiếp này khi có, thay vì chỉ suy từ đơn vị.

## 12. Quy trình tiếp nhận đề xuất

1. Bệnh nhân được tạo hồ sơ registry và cung cấp thông tin/đồng ý theo phạm vi đã chốt.
2. Thu thập bộ thông tin ban đầu và hồ sơ lịch sử; đánh dấu phần tự khai.
3. Khi có lần khám hoặc đợt tài liệu mới, hệ thống nhận file và tìm thông tin cơ sở, loại hồ sơ, mã gốc, thời gian.
4. Chọn cấu hình đọc phù hợp nếu nhận ra mẫu đã kiểm chứng; nếu không, dùng luồng đọc tổng quát và giữ phần chưa ánh xạ.
5. Trích xuất kết quả, tên thuốc và thông tin lâm sàng; lưu vị trí bằng chứng.
6. Kiểm tra bệnh nhân, ngày, đơn vị, phương pháp, kết quả lặp và nguồn mâu thuẫn.
7. Người được phân công đối chiếu; chuyển bác sĩ các nội dung cần đánh giá chuyên môn.
8. Cập nhật dòng thời gian và các biểu mẫu theo dõi bằng dữ liệu có trạng thái phù hợp, giữ liên kết nguồn.
9. Xuất bộ dữ liệu với tiêu chí chọn, phiên bản và mức kiểm chứng được ghi rõ.

Phải có một nơi xác định bản dữ liệu đã duyệt là bản có thẩm quyền. Nếu tương lai nối thêm nền tảng biểu mẫu hoặc AI, cần ánh xạ ID, chiều đồng bộ, phiên bản và cách giải quyết xung đột; không tạo hai bản dữ liệu sạch độc lập.

## 13. Bộ mẫu còn cần để kiểm chứng thực tế

Nguồn công khai đủ để định hướng cấu trúc, chưa đủ huấn luyện hoặc đánh giá bộ đọc cho tất cả bệnh viện. Bước tiếp theo là xây bộ hồ sơ mẫu được phép dùng, đã xử lý thông tin định danh phù hợp.

| Nhóm mẫu | Mục tiêu phủ |
| --- | --- |
| Huyết học, sinh hóa | Bảng nhiều dòng, dấu thập phân, cờ bất thường và đơn vị |
| Nước tiểu, protein niệu | Mẫu tươi/24 giờ, số tế bào, tỷ số, loại mẫu |
| ANA, anti-dsDNA, C3/C4, panel | Kết quả số/định tính, hiệu giá, pattern, cường độ, phương pháp |
| Đơn thuốc | Tên, hàm lượng, liều/lần, lịch dùng và ngày kê |
| Giấy khám, ra viện, tóm tắt bệnh án | Diễn tiến, chẩn đoán theo mốc và kết quả được dẫn lại |
| Sinh thiết, hình ảnh, PFT | Báo cáo văn bản, phân loại và các điều kiện đo |
| PDF/ảnh chụp/ảnh màn hình | Độ nghiêng, mờ, nhiều trang, định dạng số và bố cục khác nhau |

Đề xuất khởi đầu 3–5 tài liệu cho mỗi loại đang ưu tiên tại mỗi nguồn bệnh viện có mẫu được phép sử dụng. Đây là số lượng để khảo sát bố cục, không đủ để tuyên bố độ chính xác. Bộ đánh giá sau đó phải độc lập với bộ dùng hiệu chỉnh và phủ phiên bản, chất lượng ảnh, trường hiếm và tình huống lỗi.

Không mặc định một mẫu hoặc phương pháp chung cho toàn bệnh viện. Quản lý theo cơ sở/phòng xét nghiệm, loại tài liệu và phiên bản/thời gian áp dụng.

## 14. Phạm vi AI và thứ tự phát triển

| Thời điểm | Chức năng AI đề xuất | Điều kiện sử dụng |
| --- | --- | --- |
| Xây pool dữ liệu | Nhận loại hồ sơ, OCR, trích xuất, gợi ý ánh xạ và phát hiện thông tin thiếu | Lưu bằng chứng, đo sai/bỏ sót và đối chiếu |
| Khi có dữ liệu sạch ổn định | Tóm tắt theo thời gian, hỗ trợ truy vấn và phân tích | Chỉ rõ dữ liệu nguồn, phạm vi và dữ liệu thiếu |
| Giai đoạn chuyên môn về sau | Hỗ trợ rà soát xét nghiệm/điều trị theo mục tiêu cụ thể | Đặc tả chuyên môn, tham chiếu và đánh giá riêng trước khi sử dụng |

Kết quả AI là bản đề xuất có phiên bản; không tự nâng dữ liệu thành “đã được bác sĩ xác nhận”. Việc hoàn thiện pool dữ liệu được đánh giá bằng chất lượng và khả năng truy nguồn, không phụ thuộc hoàn thành AI hỗ trợ điều trị.

## 15. Quyết định có thể đưa vào kế hoạch

- Đã xác nhận: xây registry lupus riêng, tham khảo mô hình công khai CURE.
- Đề xuất: có hồ sơ ban đầu, các lần theo dõi, phần bệnh nhân và phần bác sĩ, xét nghiệm lặp và kho tài liệu có nguồn.
- Đề xuất: tiếp nhận nguồn từ nhiều bệnh viện ngay trong mô hình dữ liệu. Điều này chưa đồng nghĩa nhiều bệnh viện cùng quản lý registry.
- Chưa chốt: công nghệ cụ thể, cách xác thực bệnh nhân, bộ trường bắt buộc, lịch theo dõi và ngân sách.
- Cần kiểm chứng: mẫu thường quy thực tế theo bệnh viện/phòng xét nghiệm, file điện tử đầu ra, phương pháp và khả năng so sánh từng xét nghiệm.

## 16. Chỉ mục nguồn

| Mã | Nguồn và mức đọc |
| --- | --- |
| V1 | [VinmecDr XP-013](https://vinmecdr.com/storage/2022/06/Phu-luc-2_-Phieu-tra-ket-qua-xet-nghiem-1.pdf): đọc được văn bản PDF, chưa xác minh hình thức bằng ảnh trang |
| V2 | [VinmecDr XP-006](https://vinmecdr.com/storage/2022/06/Phu-luc-2_-Phieu-tra-ket-qua-xet-nghiem.pdf): đọc được văn bản PDF, chưa xác minh hình thức bằng ảnh trang |
| B1 | [Bạch Mai Care và kết quả cận lâm sàng](https://bachmai.gov.vn/bai-viet/app-bach-mai-care-ra-mat-tinh-nang-moi-co-du-ket-qua-dien-thoai-tu-bao-nguoi-benh-khong-con-phai-cho-doi?id=5eddba7e-d16d-4a11-8a6d-3b95202070f5): đọc được nội dung trang |
| B2 | [Bạch Mai trích sao hồ sơ trực tuyến](https://bachmai.gov.vn/bai-viet/benh-vien-bach-mai-trien-khai-trich-sao-ho-so-benh-an-truc-tuyen?id=d194e513-361e-4c35-8ca8-f8745693f163): đọc được nội dung qua công cụ tìm kiếm |
| D1 | [Việt Đức, yêu cầu phần mềm 08/2024](https://benhvienvietduc.org/wp-content/uploads/2024/08/Th%C6%B0-m%E1%BB%9Di-ch%C3%A0o-gi%C3%A1-3684.-V%C4%90.CNTT_.-16.8.2024.pdf): đọc được văn bản tài liệu, không phải mẫu phiếu |
| R1 | [Chợ Rẫy giới thiệu ứng dụng](https://bvchoray.vn/bai-viet/2-benh-vien-cho-ray-trien-khai-ung-dung-%28app%29-bv-ch-20250813013559213.html): đọc được nội dung qua công cụ tìm kiếm, mở trực tiếp có timeout |
| R2 | [Chợ Rẫy hướng dẫn sử dụng](https://bvchoray.vn/bai-viet/1-huong-dan-chi-tiet-cach-su-dung-cac-tinh-nang-tren-20250820074937999.html): đọc được nội dung qua công cụ tìm kiếm |
| M1 | [Danh mục MEDLATEC 2026](https://medlatec.vn/phu-luc-danh-muc-xet-nghiem-medlatec-2026): đọc được phần nội dung liên quan loại mẫu, không phải đọc toàn bộ danh mục |
| H1 | [Hùng Vương tra cứu qua QR](https://bvhungvuong.vn/danh-cho-benh-nhan/ung-dung-qr-code-trong-tra-cuu-ket-qua-xet-nghiem): đọc được đoạn nội dung liên quan quy trình qua tìm kiếm |
| C1 | [CURE trang chủ](https://urticaria-registry.com/): đọc được nội dung công khai |
| C2 | [CURE For Participants](https://urticaria-registry.com/for-participants/): đọc được nội dung công khai |
| C3 | [CURE Key facts](https://urticaria-registry.com/key-facts/): đọc được nội dung công khai |
| C4 | [CURE hướng dẫn REDCap V1.0](https://urticaria-registry.com/wp-content/uploads/2025/07/Information-sheet-on-new-data-entry-via-REDCap_V1.0_EN.pdf): đọc được đoạn lập chỉ mục, chưa xác minh đầy đủ 11 trang |
| T1 | [REDCap Software](https://www.project-redcap.org/software/): đọc được mô tả chính thức của nền tảng |

Các nhận định về tính năng là mô tả tại thời điểm khảo sát, không thay thế kiểm thử hoặc xác nhận với đơn vị cung cấp. Báo cáo không khẳng định có quyền truy cập dữ liệu, API hoặc quyền sao chép biểu mẫu của các tổ chức trên.

## 17. Bổ sung nguồn và kiểm tra truy cập ngày 05/11/2026

### 17.1 N1: Phiếu tóm tắt thông tin điều trị lupus của Bệnh viện Nguyễn Tri Phương

Nguồn: [PDF công khai của Khoa Cơ Xương Khớp](https://bvnguyentriphuong.com.vn/uploads/072022/files/3_%20LUPUS.pdf). Công cụ web đã đọc được văn bản của toàn bộ một trang. Chưa lưu được bản PDF gốc về máy và chưa xác nhận bố cục bằng ảnh trang quan sát được.

Phiếu có các nhóm biểu hiện cơ quan, điểm SLEDAI, tự kháng thể, bổ thể C3/C4, bệnh kèm theo, điều trị bằng corticoid, HCQ và thuốc ức chế miễn dịch; cuối phiếu có phần biến chứng, ngày và người ký. Đây là phiếu tóm tắt điều trị SLE, không phải phiếu kết quả xét nghiệm của phòng xét nghiệm. Chưa xác minh ngày ban hành hoặc phiên bản hiện hành; đường dẫn chứa 07/2022 không đủ để xác nhận ngày ban hành.

Áp dụng đề xuất: dùng nguồn này để khảo sát cách nhóm thông tin điều trị và diễn tiến. Không coi ô chọn tự kháng thể là bằng chứng của một kết quả xét nghiệm dương tính nếu chưa có quy ước điền hoặc tài liệu kết quả đi kèm; không suy ra đơn vị, phương pháp hay khoảng tham chiếu từ phiếu này.

### 17.2 Phân biệt các kênh truy cập

- Tải trực tiếp: log người dùng cung cấp ghi `curl (7)`, `HTTP 000`, `bytes 0` với VinmecDr và kcb.vn; Invoke-WebRequest tới PDF Nguyễn Tri Phương cũng thất bại. Phép thử bổ sung tới `https://example.com` trong phiên này cũng trả `curl (7)`. Các kết quả chưa xác định được nguyên nhân gốc, nhưng không đủ cơ sở kết luận riêng các website bệnh viện đã ngừng hoạt động hay PDF không tồn tại.
- Computer Use: log người dùng cung cấp ghi không kết nối được native pipe (`os error 2`) và browser access host; chưa có bằng chứng kênh này đã phục hồi. Đây là lỗi kết nối công cụ điều khiển, cần phân biệt với lỗi tải HTTP.
- Công cụ web: mở được văn bản PDF N1 ở trên. Lần mở lại PDF VinmecDr XP-013 trong phiên này trả timeout; mức đọc ghi ở mục V1 là kết quả khảo sát trước đó.

Đọc được tài liệu qua công cụ web không đồng nghĩa đã tải và kiểm tra một file PDF cục bộ. Các thư mục `research` và `tmp` chưa có file tải về tại thời điểm kiểm tra này.
