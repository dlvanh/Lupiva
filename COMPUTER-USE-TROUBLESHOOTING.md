# Kiểm tra lỗi Chrome / Computer Use

Ngày ghi nhận: 04/11/2026. Đây là hướng dẫn chẩn đoán; chưa xác nhận nguyên nhân gốc hoặc sửa thành công.

## 1. Bằng chứng đã có

| Kiểm tra | Kết quả |
| --- | --- |
| Nhìn thấy Chrome sau restart | Có, đọc được thông tin tab CURE |
| Đọc URL qua kết nối trực tiếp | Thành công |
| Đọc nội dung trang và chụp trang | Báo `Cannot read properties of undefined (reading 'timeoutMs')` |
| Đặt lại phiên công cụ và restart Chrome | Lỗi vẫn xuất hiện |
| Kênh điều khiển Windows trực tiếp, lần thử trước | Báo `Computer Use native pipe is unavailable`, kèm `os error 2` |
| File khai báo native host của tiện ích Chrome | Tồn tại tại `%LOCALAPPDATA%\OpenAI\extension\com.openai.codexextension.json` |
| File chương trình được khai báo trong manifest | Tồn tại; điều này chưa chứng minh host đang chạy hoặc kết nối đúng |

`timeoutMs` trong lỗi trên là tên thuộc tính mà JavaScript không đọc được từ một đối tượng chưa có giá trị. Không có bằng chứng rằng tăng thời gian chờ sẽ sửa được lỗi.

Kênh Chrome và kênh điều khiển Windows là hai phép thử khác nhau. Chưa kết luận hai lỗi cùng nguyên nhân. Các khả năng như trạng thái phiên bị lỗi, phiên bản không tương thích hoặc thành phần kết nối hoạt động không đúng cần thêm bằng chứng.

## 2. Kiểm tra theo thứ tự

Thực hiện từng bước và kiểm tra lại, để biết bước nào có tác dụng.

1. **Kiểm tra tiện ích trên đúng Chrome profile.** Mở `chrome://extensions`, tìm tiện ích ChatGPT/Codex đang sử dụng. Ghi tên và phiên bản, xác nhận tiện ích đang bật. Nhấn biểu tượng tiện ích trên thanh công cụ và xem bảng bên có tải được không.
2. **Kiểm tra trạng thái trong ứng dụng desktop.** Mở Settings > Computer Use. Theo tài liệu chính thức, Chrome đã thiết lập phải có nút Manage; nếu còn Install thì luồng thiết lập chưa hoàn tất. Nếu giao diện của bản đang dùng khác, ghi lại đúng tên và trạng thái đang thấy.
3. **Thử một chat mới với trang đơn giản.** Trong chat mới, chọn `@Chrome` từ menu và gửi: “Mở https://example.com rồi đọc tiêu đề và đoạn văn đầu tiên bằng trình duyệt, không dùng công cụ tìm kiếm web.”
4. **So sánh kết quả.** Nếu chat mới hoạt động thì lỗi có thể liên quan trạng thái chat cũ. Nếu trang đơn giản cũng lỗi tương tự thì chưa có cơ sở quy lỗi riêng cho CURE hoặc PDF. Nếu trang đơn giản hoạt động nhưng CURE lỗi, kiểm tra thông báo của trang và trạng thái quyền dành cho tên miền đó.
5. **Nếu chat mới vẫn lỗi, cập nhật và khởi động lại ứng dụng desktop.** Ghi phiên bản trước; nếu có bản cập nhật chính thức thì cập nhật, rồi thử lại. Sau đó thử thoát hẳn và mở lại ứng dụng desktop. Chrome đã được restart nên không cần lặp lại bước đó liên tục.
6. **Nếu vẫn lỗi, thu thập thông báo bên dưới.** Tài liệu chính thức còn đề xuất cài lại tiện ích thông qua Settings > Computer Use khi kết nối vẫn thất bại. Chỉ làm sau khi đã ghi lại phiên bản và lỗi hiện tại; việc này không bảo đảm sửa được lỗi `timeoutMs` cụ thể.

Các bước thiết lập và khôi phục chung dựa trên [OpenAI: Browser extension — Troubleshooting](https://learn.chatgpt.com/docs/chrome-extension). Phép thử example.com và cách diễn giải kết quả là đề xuất chẩn đoán cho sự cố này.

## 3. Cách xem lỗi của tiện ích

1. Mở `chrome://extensions` và tìm đúng tiện ích.
2. Nếu thẻ tiện ích có mục Errors/Lỗi, mở và ghi lại thông báo cùng stack trace.
3. Nếu có liên kết Inspect views / service worker, mở cửa sổ kiểm tra và chọn Console. Nếu các mục này không xuất hiện, giao diện Chrome có thể yêu cầu bật Developer mode để hiện công cụ chẩn đoán. Không cần tải tiện ích ngoài hoặc sửa mã nguồn.
4. Giữ Console mở, thực hiện lại đúng một yêu cầu đọc example.com trong chat mới, rồi ghi lại lỗi xuất hiện cùng thời điểm. Có thể không xuất hiện lỗi ở phía tiện ích nếu lỗi nằm ở ứng dụng desktop hoặc lớp công cụ.
5. Ghi phiên bản Chrome tại `chrome://version` và phiên bản ứng dụng desktop từ phần About/Giới thiệu của bản đang dùng.

Các mục trong Chrome là hướng dẫn kiểm tra thủ công; chưa được xác minh trực tiếp trên giao diện máy này vì thao tác đọc trang đang lỗi. Không cần chạy mã JavaScript lạ trong Console.

## 4. Mẫu báo lỗi tối thiểu

```text
Ngày giờ và múi giờ:
Hệ điều hành: Windows
Tên và phiên bản ứng dụng desktop:
Phiên bản Chrome:
Tên và phiên bản tiện ích:
Settings > Computer Use hiển thị:
Bảng bên của tiện ích có tải được không:
Chat mới + example.com: thành công / lỗi
Đọc được URL/tab nhưng không đọc được nội dung: có / không
Thông báo lỗi: Cannot read properties of undefined (reading 'timeoutMs')
Stack trace từ tiện ích, nếu có:
Đã thử: restart Chrome; đặt lại phiên công cụ
Các bước khác đã thử và kết quả:
```

Chỉ chia sẻ phần lỗi liên quan; kiểm tra và bỏ token, cookie, thông tin đăng nhập hoặc dữ liệu bệnh nhân nếu chúng có trong log. Không cần gửi toàn bộ hồ sơ hoặc toàn bộ lịch sử chat để chẩn đoán bước đầu.

Theo [OpenAI: Troubleshooting — Feedback and logs](https://learn.chatgpt.com/docs/reference/troubleshooting), có thể dùng menu `/` để tìm chức năng feedback. Hướng dẫn tiện ích cũng đề cập `/feedback` và chat ID khi liên hệ hỗ trợ. Tự xem lại nội dung sẽ được chia sẻ trước khi gửi.

## 5. Tiêu chí xác nhận đã phục hồi

Computer Use phải đọc được nội dung thực tế của example.com và thực hiện được thao tác duyệt trang được yêu cầu. Việc chỉ liệt kê được Chrome hoặc URL tab chưa đủ để kết luận đã sửa xong. Sau đó mới quay lại tải một PDF công khai và kiểm tra file thực sự được lưu về máy.
