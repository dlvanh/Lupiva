# Gửi ảnh → hồ sơ bệnh nhân → kiểm tra và duyệt

Mở **http://127.0.0.1:8773**. Mỗi lượt gửi là một bệnh nhân: toàn bộ ảnh đã chọn được lưu cùng hồ sơ, chạy OCR tại máy và hiển thị để đối chiếu. Không cần tạo bundle, duyệt nguồn hoặc liên kết từng ảnh trước khi có hồ sơ bệnh nhân.

## Thao tác trên màn hình

1. Nhập tên người thực hiện ở đầu trang.
2. Trong khung **Thêm hồ sơ từ ảnh** ở đầu trang (mở sẵn), bấm **Chọn / thêm ảnh**. Có thể chọn nhiều ảnh cùng lúc hoặc bấm chọn thêm nhiều lần; danh sách cũ được giữ lại. Tên, thứ tự và dung lượng từng ảnh hiện ngay, có **Bỏ ảnh** và **Bỏ tất cả ảnh đã chọn** trước khi gửi. Ảnh trùng nội dung được bỏ qua kể cả khi khác tên. Có thể nhập mã hồ sơ nội bộ hoặc để hệ thống tạo; mã này không thay Study ID.
3. Xác nhận các ảnh cùng một bệnh nhân, chọn **Tạo hồ sơ và xử lý ảnh**.
4. Hồ sơ được tạo ngay, có đủ **261 mục / 377 thành phần**. Ảnh được lưu trước, OCR chạy nền theo hàng đợi. Có thể xem tiến độ hoặc mở lại hồ sơ từ danh sách lượt gửi.
5. Khi xử lý xong, các giá trị OCR xuất hiện trong hồ sơ với trạng thái **chờ duyệt**. Mỗi giá trị giữ đơn vị, ngày và nguồn riêng. Dùng **Xem / sửa** để mở đúng giá trị và ảnh nguồn. Kết quả xét nghiệm có nút **Duyệt** hoặc **Lưu sửa và duyệt**. Thông tin trên phiếu và thu mẫu có luồng đề xuất/duyệt bản sửa riêng.
6. Chọn những giá trị đã kiểm tra, ghi chú, xác nhận và **Lưu duyệt**. Có thể lọc và chọn nhiều giá trị cùng lúc. [Chi tiết duyệt](PATIENT-FIELDS-REVIEW.md), [sửa thông tin nguồn](SOURCE-CORRECTIONS.md).
7. Dùng **Lượt gửi bệnh nhân khác** để bắt đầu hồ sơ tiếp theo. Không tự gom lượt gửi khác vào bệnh nhân đang xem hoặc gộp theo PID/SID OCR.

Đủ cấu trúc trường không đồng nghĩa OCR luôn đọc được mọi giá trị. Ô thiếu vẫn trống, không suy thành Không/âm tính/0. Bản thử hiện chưa có thao tác thêm ảnh vào bệnh nhân đã có hoặc tạo ứng viên mới cho trường hoàn toàn trống. Không chọn lại ảnh của bệnh nhân cũ để tạo một bệnh nhân khác.

## Lưu ảnh và xử lý lỗi

- Nhận JPEG, PNG, TIFF một trang, BMP và WebP; tối đa 50 ảnh/lượt, 20 MiB/ảnh, tổng 100 MiB, 50 triệu pixel/ảnh. Chưa nhận PDF hoặc TIFF nhiều trang.
- Mất mạng sau khi gửi: tiếp tục cùng lượt gửi, không tạo lại bệnh nhân. Sau khi tải lại trang, dùng **Tiếp tục tải ảnh cho hồ sơ này** và chọn lại đủ bộ ảnh theo thứ tự cũ. Mỗi file có ID/hash; gửi lại cùng file không tạo bản trùng. File khác không được thay file đã lưu.
- Khi lượt gửi đã được tạo, danh sách ảnh được giữ cố định để gửi lại an toàn sau lỗi mạng; không đổi thứ tự hoặc bỏ ảnh của lượt đang gửi. Muốn gửi cho người khác, dùng **Lượt gửi bệnh nhân khác**. Giới hạn 50 ảnh/100 MiB áp dụng cho toàn bộ danh sách cộng dồn, không phải riêng từng lần chọn.
- OCR thất bại: ảnh và bệnh nhân được giữ. Nút **Chạy lại OCR với ảnh đã lưu** dùng cùng bệnh nhân và thư mục xử lý mới; không ghi đè lần cũ.
- Nếu báo cần kiểm tra tiến trình, phải xác minh tiến trình cũ trước khi phục hồi. Không tự chạy lại hoặc cho job GPU kế tiếp chạy khi trạng thái khởi động chưa chắc chắn.
- Mỗi ảnh gốc có SHA256. Kết quả phải chứa đúng toàn bộ ảnh trong lượt gửi; nhập bundle và liên kết tài liệu được ghi trong cùng một giao dịch. Lỗi sẽ hoàn tác toàn bộ phần nhập/liên kết, không mất ảnh gốc.

Mặc định ảnh và artifacts nằm tại `research/patient-intakes/<tên-SQL>/<job_id>/`; bảng `patient_intakes` và `patient_intake_files` lưu lượt gửi, trạng thái, người khai báo và nguồn. Bundle hoàn tất được nạp lại khi server khởi động. Sao lưu cả SQLite và thư mục ảnh/artifacts; SQL riêng không chứa bản nhị phân của ảnh.

## API cục bộ

- `POST /api/intakes`: `request_id`, `file_count`, `same_patient=true`, `actor`, `role`, và tùy chọn `registry_code`. Tạo một hồ sơ ngay; retry cùng yêu cầu trả hồ sơ cũ.
- `POST /api/intakes/image?job_id=...&file_id=...&name=...`: body nhị phân `application/octet-stream`, header `X-Review-Token`. Chỉ nhận ảnh hợp lệ, không nhận đường dẫn file từ client.
- `POST /api/intakes/start`: `{job_id}` sau khi đủ ảnh; `{job_id,retry:true}` cho lần OCR thất bại đã xác minh không còn tiến trình cũ.
- `GET /api/intakes`: tiến độ và danh sách ảnh; `GET /api/intakes/source?job_id=...&file_id=...`: ảnh gốc đã kiểm hash.
- `GET /api/patient?case_id=...`: toàn bộ danh mục, dữ liệu và trạng thái duyệt. Tải JSON đầy đủ tại `/api/patient/export?case_id=...`.

Upload và OCR không tạo quyết định duyệt. Việc nhóm bệnh nhân dựa vào xác nhận tường minh của người gửi; nhãn PID/SID trên ảnh vẫn cần đối chiếu khi duyệt. Không tự tạo lần khám hoặc gán một ngày chung cho tất cả kết quả.

## Phạm vi hiện tại

Đây là bản chạy **localhost trên một máy**, vai trò do người dùng khai báo; chưa có đăng nhập, phân quyền hoặc cô lập dữ liệu giữa nhiều tài khoản. Toàn bộ ảnh/OCR được xử lý tại máy với model sẵn có. Để triển khai cho nhiều người dùng qua mạng còn cần xác thực, phân quyền và lưu trữ dùng chung có kiểm soát.

Kiểm thử chức năng dùng tài liệu giả với tên/giá trị mới, gồm upload HTTP, nhóm đúng bệnh nhân, danh mục đầy đủ, retry, rollback, phục hồi sau restart, nguồn bị thay đổi, chờ duyệt và lưu quyết định. Kiểm thử controller JS không thay thế kiểm tra trực quan trình duyệt. Khả năng đọc đúng hồ sơ thực tế mới vẫn cần đánh giá độc lập; các trường tiền sử/thuốc/nội dung tự do và bố cục lạ chưa được bảo đảm trích đầy đủ.
