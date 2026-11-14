# Sửa thông tin nguồn cho tài liệu mới

Luồng sửa dùng package/revision, candidate và bằng chứng của tài liệu đang chọn. Không dò tên IN01–IN12, không gắn sẵn ngày hoặc đáp án của bộ ảnh phát triển vào parser. OCR gốc, phê duyệt cũ và các lần đo vẫn được giữ nguyên.

## Đề xuất rồi duyệt bản sửa

1. Ở hồ sơ bệnh nhân, chọn **Xem / sửa** trên kết quả trong bảng **Không thuộc CRF**, hoặc mở **Thông tin trên phiếu và thu mẫu** để chọn thông tin đầu phiếu/mẫu. Khung bên cạnh chỉ hiện đúng giá trị và ảnh của nó. Phần đề xuất sửa mở ngay trong khung.
2. Mở crop hoặc ảnh nguồn, sửa chữ đọc được, chọn bằng chứng và ghi lý do. Ngày nhập theo **DD/MM/YYYY**, giờ **HH:MM**, lượng có cả số và đơn vị. Ô thu mẫu bỏ trống được ghi là null; không tự thay bằng 0, No hoặc ngày trên tài liệu khác. Muốn bỏ một giá trị metadata đã duyệt, dùng **Rút duyệt nguồn**; không tạo bản sửa metadata rỗng để duyệt.
3. **Lưu đề xuất sửa** chỉ thêm bản chờ duyệt. Giá trị đang được duyệt và các bản xuất vẫn dùng quyết định trước đó.
4. Đối chiếu phần trước/sau, đánh dấu xác nhận và chọn **Duyệt bản sửa này**. Chỉ lúc này giá trị sửa mới được dùng trong workspace, JSON và CSV xuất mới.

Nếu đề xuất sai, nhập lý do và chọn **Bỏ đề xuất này, giữ giá trị hiện hành**. Thao tác ghi thêm lịch sử rút đề xuất, không loại ứng viên và không rút phê duyệt của giá trị đang dùng.

Lịch sử ghi người đề xuất, vai trò khai báo, thời gian, lý do, bằng chứng, giá trị trước/sau và quyết định áp dụng. Người dùng phải tự nhập tên thật của mình khi duyệt; trợ lý không tự duyệt thay người dùng. Vai trò của bản thử localhost chưa phải hệ thống xác thực nhiều người dùng.

Phê duyệt thông thường hoặc duyệt hàng loạt giữ giá trị đang hiệu lực, **không tự chấp nhận đề xuất sửa đang chờ**. Muốn áp dụng đề xuất, dùng nút dành riêng cho bản sửa. Sau thay đổi quyết định hoặc revision, đề xuất cũ không được áp dụng lên nền dữ liệu khác; cần tải lại và lập đề xuất mới. Gửi lại cùng yêu cầu sau lỗi mạng không ghi trùng.

Hiện hỗ trợ metadata vô hướng (mã, ngày, tuổi/giới/chiều cao/cân nặng, thông tin nguồn bằng chữ), ngày/giờ/lượng/checkbox của mẫu và kết quả/đơn vị của xét nghiệm bổ sung đã có ứng viên. Xét nghiệm bổ sung cho sửa từng ô kết quả tường minh, không nhận JSON tùy ý hoặc đổi ánh xạ CRF. Kết quả đã có diễn giải từ ký hiệu/legend chỉ cho sửa đơn vị trong editor này; không đổi chỉ số rồi giữ một diễn giải không còn được kiểm chứng. Sửa kết quả thuộc CRF dùng editor kết quả hiện có. Chưa tạo ứng viên tiền sử/lâm sàng mới cho ô hoàn toàn trống.

Sửa metadata không tự thay ngày, mã hoặc giá trị của observations đã liên kết với nó; các ứng viên đó có lịch sử duyệt riêng và cần đối chiếu riêng. Không tự gán lại bệnh nhân, tạo lần khám, suy bệnh hoặc tính điểm lâm sàng. Cờ lỗi OCR còn trong lịch sử nguồn; bản chép sửa có nhãn `source_value_origin=source_transcription`.

## Đưa một bộ tài liệu mới vào

**Luồng chính hiện tại:** dùng **Thêm hồ sơ từ ảnh** ở đầu trang, bấm **Chọn / thêm ảnh** một hoặc nhiều lần rồi gửi toàn bộ danh sách; một lượt tạo một hồ sơ bệnh nhân và tự liên kết các ảnh theo xác nhận của người gửi. OCR chạy nền, dữ liệu chờ kiểm tra/duyệt; không cần làm các bước CLI bên dưới. Xem [hướng dẫn gửi ảnh](PATIENT-IMAGE-INTAKE.md). Phần dưới dành cho xử lý kỹ thuật theo manifest ngoài luồng upload.

Tạo manifest riêng chỉ chứa mã và đường dẫn ảnh, ví dụ `research/new-documents/source-manifest.json`:

```json
{"documents":[{"document_id":"NEW-DOC-001","input_path":"research/new-documents/report-001.jpg"}]}
```

Đường dẫn nằm trong workspace dự án. Runner nhận ảnh và quy ước ngày DMY; giao diện hiện có upload ảnh, chưa nhận PDF nhiều trang. Chạy offline với model và môi trường sẵn có, dùng thư mục output mới:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/run_automatic_pool.py --manifest research/new-documents/source-manifest.json --output research/new-documents/workflow-01 --db research/new-documents/validation.sqlite
```

Kiểm tra báo cáo/artifacts và bundle do runner tạo trước khi nhập vào kho chính. Không tái sử dụng package ID/revision của một bộ tài liệu khác; không resume workflow cũ sau khi code/input/model/settings đã đổi hash. Run thất bại không phải đã hoàn thành OCR. Dùng `scripts/manage_pool.py import --bundle NEW-BUNDLE --db LOCAL-REGISTRY.sqlite` để nhập bundle đã kiểm; mở server với thêm `--bundle NEW-BUNDLE`. Xác nhận liên kết bệnh nhân và phê duyệt nguồn vẫn là các bước riêng. Không tự gom tài liệu mới vào bệnh nhân đang xem.

Luồng đề xuất sửa được dùng cho mọi candidate mới có cùng schema. Ngày OCR hỏng như chuỗi chín chữ số vẫn cần đối chiếu ảnh; không có quy tắc thay chữ số bằng dấu `/` hoặc mượn ngày của mẫu khác.

## Trường chưa có giá trị

Workspace giải thích riêng: chưa có tài liệu liên kết; chưa có mã nghiên cứu; cần thông tin/đánh giá lâm sàng; chưa có ứng viên từ tài liệu liên kết; hoặc chưa có bộ trích được khai báo. Các trạng thái được tạo từ dictionary và phạm vi tài liệu của bệnh nhân, không chép phân loại từ báo cáo rà 12 ảnh sang bệnh nhân mới. Không có ứng viên không chứng minh nguồn không ghi.

## API và lưu trữ

- `POST /api/source-correction`: package/revision, loại/mã candidate, changes, evidence_ids, actor/role/reason/request_id và các hash/ID kỳ vọng. Chỉ thêm đề xuất.
- `POST /api/source-review`: quyết định approve kèm `correction_id` để áp dụng đúng bản sửa. Bỏ `correction_id` giữ giá trị đang hiệu lực khi duyệt lại.
- `GET /api/package`: gồm `effective_source_data`, `correction_fields`, `correction_history`, `pending_correction`, bên cạnh `source_data` gốc.
- Bảng append-only `source_corrections`; quyết định nguồn hiện có lưu `correction_id` và `after`. Mở server tự thêm bảng/index/trigger, không cập nhật bản OCR hoặc quyết định cũ. Sao lưu SQL trước khi mở phiên bản mới.

Cả đề xuất và duyệt qua HTTP kiểm lại hash bundle/assets. Kiểm thử tổng hợp bao gồm ngày khác bộ phát triển, metadata khác, nguồn bị sửa, dữ liệu cũ, cô lập candidate/revision, rollback, retry, quyền trợ lý, JSON và CSV. Đây là kiểm thử chức năng; chưa chứng minh độ chính xác OCR trên bệnh án thực tế mới. Kiểm tra trực quan trình duyệt còn thiếu do native pipe/browser host không khả dụng.
