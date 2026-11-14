# Duyệt pool tại máy — bản thử 07/11/2026

**Giao diện rút gọn09/11:** chọn bệnh nhân → xem/lọc giá trị → **Xem / sửa** mở khung đúng giá trị và ảnh → duyệt từng giá trị hoặc chọn nhiều để **Lưu duyệt**. Thêm ảnh nằm ở mục thu gọn **Thêm hồ sơ từ ảnh**. Quản lý gói/ca/liên kết/xuất kỹ thuật đã ẩn khỏi trang chính; các bước đó bên dưới là hướng dẫn của bản giao diện trước.

**Luồng nhận ảnh mới09/11:** tại8773 chọn **Tạo hồ sơ bệnh nhân từ ảnh**. Mỗi lượt nhiều ảnh tạo một bệnh nhân, OCR chạy nền và dữ liệu chờ kiểm tra/duyệt. [Hướng dẫn nhận ảnh](PATIENT-IMAGE-INTAKE.md); liên kết/duyệt từng ảnh trước không còn là bước bắt buộc của luồng này.

**Bản đang dùng sau bổ sung trích xuất 08/11: http://127.0.0.1:8773.** Chọn bộ lọc dữ liệu cần duyệt để xem66ứng viên mới; giữ175kết quả đã duyệt. Các địa chỉ8772 bên dưới là mốc cũ. Lệnh khởi động đủ3bundle và giải thích dữ liệu mới: [PATIENT-FIELDS-REVIEW.md](PATIENT-FIELDS-REVIEW.md), [SOURCE-EXTRACTION-IMPROVEMENTS.md](SOURCE-EXTRACTION-IMPROVEMENTS.md).

## Cập nhật 08/11 — đủ trường theo bệnh nhân và duyệt hàng loạt

Mở **http://127.0.0.1:8772** để dùng bản mới trên SQL thật. Bảng bệnh nhân hiện đủ261mục/377thành phần, kể cả chưa có dữ liệu, kèm tìm kiếm/lọc nhóm/trạng thái, ảnh/crop nguồn và tải toàn bộ trường JSON. Chọn nhiều giá trị hoặc tất cả giá trị trong bộ lọc, nhập ghi chú và xác nhận rồi lưu một đợt; có duyệt/cần làm rõ/loại/rút duyệt, lịch sử theo đợt, kiểm snapshot và giao dịch SQL hoàn tác trọn đợt khi lỗi. Không duyệt ô trống thành giá trị. Xem [hướng dẫn đầy đủ](PATIENT-FIELDS-REVIEW.md).

Hồ sơ LUPUS-000001 giữ nguyên12tài liệu,175kết quả/91mục,56metadata,3mục mẫu và toàn bộ phê duyệt cũ. Đã kiểm213Python tests và2JS controller smoke; HTTP thật tải đủ234giá trị ứng viên và377thành phần, đối chiếu175kết quả cũ không đổi. Không chạy OCR hoặc tự lưu duyệt lại dữ liệu thật. Kiểm trực quan browser chưa thực hiện được vì native pipe của Computer Use không kết nối. Các cổng và hướng dẫn bên dưới là lịch sử.

## Hồ sơ bệnh nhân từ 12 ảnh inputs — cập nhật mới nhất

Người dùng đã xác nhận IN01–IN12 thuộc cùng một bệnh nhân và yêu cầu gom thành dữ liệu bệnh nhân. Kho chính hiện có **LUPUS-000001**, 12 liên kết tài liệu và175kết quả source_verified dùng lại từ phê duyệt nguồn đã lưu, cùng56metadata và3dòng mẫu. Ghi rõ người dùng xác nhận qua hội thoại và Codex ghi nhận thay; không gán Study ID, không suy lần khám hoặc đánh giá lâm sàng. Bản backup trước batch và receipt cục bộ ở `research/patient-inputs-20261107-01/` và `research/registry-pool/backups/`.

Mở **http://127.0.0.1:8771** để xem giao diện mới. Hồ sơ duy nhất được chọn sẵn, bảng dữ liệu có lọc, ngày và ảnh nguồn. Xem trước rồi tạo CSV hoặc Word tổng hợp cả bệnh nhân; có thể chọn riêng visit khi sau này xác nhận visit. Các mục bên dưới ghi “chưa có ca” là lịch sử trước lần xác nhận này.

## Duyệt nguồn revision 5 đã được lưu — trạng thái mới nhất

Người dùng đã đọc/kiểm tra và yêu cầu chuyển kết quả sang đã duyệt. Kho chính hiện có một batch **175 quan sát +56 metadata +3 dòng mẫu đã duyệt đối chiếu nguồn**, có snapshot/hash/thời điểm/quote và phân biệt người dùng duyệt với Codex ghi nhận thay. Các hướng dẫn “chưa có thao tác duyệt metadata/specimen” bên dưới là lịch sử. OCR gốc không bị UPDATE; xem trạng thái hiệu lực tại phần **Duyệt đối chiếu nguồn** và danh sách kết quả.

Server mới: session **75271**, `http://127.0.0.1:8766`; session93509 đã dừng. Tải lại trang để nạp giao diện mới. Đầu trang hiển thị số đã duyệt của từng nhóm, lịch sử xác nhận và **Tải pool đã duyệt nguồn (JSON)**. Metadata và dữ liệu mẫu có crop/raw và thao tác duyệt/loại/cần làm rõ/rút; mỗi lần cần tên người đang thực hiện và lý do, có kiểm quyết định trước để tránh ghi đè từ tab cũ. Bulk approve chỉ áp dụng phiên bản đang chọn và cần xác nhận đã đối chiếu toàn bộ. Phê duyệt không tự truyền sang OCR revision mới.

Pool nguồn xuất theo revision giữ đủ261 mục, từng lần đo/mẫu, evidence/review IDs và các ô trống; chỉ gồm ứng viên còn quyết định approve. Có thể tải qua `/api/source-reviewed?package_id=...&revision=5`; không phải file import REDCap. Bản đã lưu: `research/source-review-20261107-01/source-reviewed-pool.json`. Lý do/authorization/receipt nằm cùng thư mục. Backup trước batch thật: `research/registry-pool/backups/registry-before-source-review-20261107-01.sqlite`.

**Duyệt nguồn và chấp nhận cho ca là hai phạm vi riêng.** Có thể duyệt chữ/số trước khi biết tài liệu thuộc ca nào; không tự gộp người hoặc gán Study ID. Phần xác nhận ca/lần khám và export theo ca bên dưới vẫn dùng quyết định riêng. Hiện chưa có ca/liên kết được xác nhận. Duyệt nguồn không điền hai ngày IN12 hoặc đổi unchecked thành No; không phải bác sĩ đánh giá lâm sàng. Sửa giá trị metadata/mẫu vẫn chưa có trên UI.

Server đã được mở lại trong lượt resume 07/11, tool session93509, URL `http://127.0.0.1:8766`, DB chính và hai bundle revision4/5-complete đúng lệnh dưới. Đã kiểm HTTP summary 200 và integrity đạt. Session21824 cũ đã mất, không dùng để poll/dừng server mới. Kho chính vẫn revision5; kết quả kiểm runner form mới nằm ở DB thử riêng, không tự đưa vào màn hình này hoặc tạo quyết định duyệt cho hồ sơ thật. Trạng thái live chỉ có giá trị tại lúc kiểm; kiểm HTTP/cổng trước khi khởi động lại.

`registry_review/` bổ sung lớp quyết định người duyệt trên kho OCR bất biến. OCR nhập vào vẫn pending/unconfirmed; không có hồ sơ thật nào được tự tạo ca, xác nhận danh tính hay chấp nhận trong quá trình phát triển module này.

## Khởi động

Từ `C:\Users\ADMIN\LUPUS-REGISTRY`:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 -m registry_review.server --db research/registry-pool/registry-20261106-01.sqlite --bundle research/ocr-pool/bundle-20261107-registry-revision4 --bundle research/ocr-pool/bundle-20261107-registry-revision5-complete --port 8766
```

Mở `http://127.0.0.1:8766`. Giữ terminal chạy; Ctrl+C để dừng. Có thể truyền nhiều `--bundle` để đối chiếu các revision khác nhau; bundle phải khớp đúng package đã nhập trong DB. Bản chưa nạp bundle vẫn xem được ứng viên, nhưng không thể chấp nhận/sửa từ màn hình này.

Revision 5 bổ sung ba specimen candidates của IN12, giữ nguyên dữ liệu clinical revision 4. Khi chọn IN12, có phần **Dữ liệu thu mẫu · ứng viên chờ duyệt**, xem Blood/Stool/Others, checkbox, ngày/giờ/lượng/raw và các crop nguồn. Đây là phần xem nguồn; **chưa có thao tác duyệt specimen, xác nhận mẫu/event hay xuất mẫu đã duyệt**. Hai ngày viết tay chưa đọc được vẫn null. Điểm form riêng là 8/10 thuộc tính trên tập phát triển, trợ lý tự đánh giá/chưa người phụ trách xác nhận; xem `OCR-FORM-RESULTS.md`.

Đây là công cụ một máy, chỉ bind IPv4 loopback. Tên và vai trò do người duyệt khai báo, **chưa có đăng nhập/phân quyền xác thực**; chưa phù hợp triển khai nhiều người dùng qua mạng. Không dùng thư viện/CDN, font hoặc API bên ngoài. Request không ghi URL có thông tin hồ sơ vào log. Chặn Host/Origin khác, POST cần token riêng và JSON; nguồn được kiểm hash khi nạp, khi phục vụ ảnh/raw và trước chấp nhận/sửa.

## Quy trình người duyệt

1. Nhập tên người đang đối chiếu và vai trò. Chọn gói/revision, tài liệu và kết quả. Mặc định mở revision có nguồn mới nhất để xem; việc này không chọn thay kết quả đã duyệt.
2. Xem crop, chữ OCR gốc và ảnh toàn trang. Chọn evidence khác nếu kết quả có nhiều bằng chứng hoặc ngày nguồn riêng. Không coi raw OCR là ảnh nguồn đã đúng.
3. Tạo mã registry nếu ca chưa có. Study ID chỉ nhập khi được cấp riêng; không tự thay bằng PID/SID. Có thể tạo lần khám/thu mẫu với ngày tường minh. Chọn ca/lần ghi nhận, ghi căn cứ, đánh dấu đã đối chiếu và lưu liên kết tài liệu.
4. Mỗi kết quả có quyết định riêng: chấp nhận, lưu sửa, loại ứng viên, cần làm rõ hoặc rút quyết định. Mọi thao tác cần lý do và ghi thời điểm/người thực hiện. Nếu đã sửa giá trị, phải dùng **Lưu sửa**; nút chấp nhận không âm thầm bỏ qua nội dung đang sửa.
5. Khi sửa kiểu kết quả, xóa thuộc tính không tương thích (ví dụ đổi số sang định tính cần xóa số/dấu so sánh). Ngày/giờ và vai trò ngày phải đi cùng nhau. Dấu trống in trên nguồn có thể xác nhận là `missing/source_placeholder`, không trở thành 0/No/âm tính. `unparsed` không được chấp nhận như giá trị đã đọc được. Intensity và diễn giải của nó vẫn giữ riêng, không suy mức độ bệnh.
6. Nếu cùng lần đo có bản đã duyệt ở revision khác, màn hình liệt kê giá trị/ngày/revision để người duyệt **chọn thay thế tường minh**. Nếu khác lần đo, giữ riêng. OCR mới không tự thắng bản đã duyệt. Rút bản thay thế không tự khôi phục bản cũ; muốn dùng lại cần quyết định mới.
7. Trong mục xuất pool, chọn ca và tùy chọn lần ghi nhận. Xem trước rồi tải JSON. File chỉ gồm quyết định chấp nhận/sửa còn hiệu lực với liên kết ca hiện tại; mâu thuẫn bị loại và có số lượng thông báo. Đây **chưa phải** CSV/metadata import REDCap hoặc Word.

Khi liên kết tài liệu thay đổi/rút, các chấp nhận trước không còn đủ điều kiện xuất đến khi được duyệt lại. Màn hình cũ lưu với review/assignment đã thay đổi sẽ bị từ chối; tải lại để xem lịch sử trước khi thao tác. Trợ lý chỉ được ghi `suggest`; không thể xác nhận/loại/rút kết quả của hồ sơ thật bằng vai trò assistant.

## Lưu trữ và kiểm chứng

- `registry_cases`, `registry_encounters`, `document_identity_events`, `review_decisions`: chỉ thêm; trigger chặn UPDATE/DELETE. Quyết định lưu trước/sau, nguồn gốc, evidence, quyết định trước và liên kết danh tính tại thời điểm duyệt.
- Dùng transaction cùng audit hash chain của registry; lỗi insert/audit rollback toàn bộ. Khóa lạc quan dùng review ID và assignment ID đã đọc, tránh lưu lên quyết định/link mới của người khác.
- Pool hiệu lực là view suy từ lịch sử. `value` chỉ chứa thuộc tính giá trị đã duyệt; trạng thái pending trong `original_source` của lịch sử vẫn giữ nguyên, không trộn vào giá trị xuất.
- Cùng source entity được chấp nhận nhiều revision có giá trị giống nhau chỉ hiển thị một lần và giữ mọi review ID. Giá trị khác nhau hiển thị mâu thuẫn và không xuất. Khác entity vẫn giữ riêng, cần người duyệt xác định cùng lần đo trước khi thay thế.

Kiểm thử dùng nguồn giả trong thư mục tạm: phân quyền khai báo trợ lý/người/bác sĩ, kiểu giá trị, concurrency, đổi identity, lịch sử thay thế/rút, rollback, source hash, HTTP và xuất loại conflict. Bộ demo ở `research/registry-review/demo-20261107-01/` chỉ có ảnh giả ghi **SYNTHETIC DEMO — NO PATIENT DATA**, không chứa thông tin bệnh nhân.

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 -m unittest discover -s tests
```

## Phần chưa hoàn tất

Chưa duyệt/sửa metadata định danh/ngày như một đối tượng riêng, chưa tạo/map observation mới từ hàng unmapped, chưa hoàn thiện phát hiện mâu thuẫn giữa các entity/tài liệu khác nhau, chưa có luồng duyệt/chỉnh sửa chi tiết specimen/event. Form đã vào bundle/kho và phần xem UI, nhưng còn hai ngày chưa đọc được, chưa nối form stages vào runner whole-image. Dictionary/component semantics, kiểm tra chéo lâm sàng, parser thuốc/văn bản và mapping REDCap/Word vẫn nằm trong plan.

HTTP đã được kiểm chứng bằng nguồn giả; JavaScript kiểm cú pháp bằng Node. **Chưa kiểm chứng hiển thị/tương tác trong trình duyệt thật**: lần thử công cụ ngày 07/11 không có browser host/native pipe. Không coi đây là UI đã qua visual QA hay sản phẩm vận hành hoàn chỉnh. Hồ sơ mới được rà độc lập vẫn cần để đánh giá chất lượng OCR ngoài bộ phát triển.
# Đề xuất sửa thông tin nguồn

[Hướng dẫn sửa và dùng với tài liệu mới](SOURCE-CORRECTIONS.md) mô tả editor metadata/thu mẫu, đề xuất chờ duyệt, lịch sử, API và giới hạn. Bản sửa đã duyệt được giữ khi duyệt lại giá trị hiện hành; OCR gốc không bị ghi đè. Sao lưu SQLite trước khi mở server mới để thêm bảng lịch sử đề xuất.
