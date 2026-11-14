# Xem đủ trường và duyệt hàng loạt theo bệnh nhân

## Cập nhật 09/11: sửa ánh xạ UPCR và ANA

Hồ sơ BN-CEDF9FAAC410 đã có thêm các ứng viên **REN01 · UPCR = 0.12 mg/mg**, **IMM01 · ANA = Homogeneous** và **IMM01 · Phương pháp = huỳnh quang**, đều chờ người dùng duyệt. Chọn phạm vi **Thuộc CRF**, tìm `REN01` hoặc `IMM01`. Tên OCR gốc “huyền quang” vẫn giữ nguyên trong bằng chứng; phương pháp được nhận diện với cờ biến thể chính tả. Đã sửa chuyển mục trong bảng để ngữ cảnh nước tiểu của UPCR không bị giữ sang ANA; không suy loại mẫu của ANA nếu nguồn chưa khai báo rõ.

Đây là gói bổ sung từ OCR đã lưu, không chạy inference lại, không sửa nguồn hoặc phê duyệt cũ. Gói `pkg-7334b94a3add3c7985378da1329f5a2a`, **revision 2** là bản hiện hành; revision 1 giữ làm lịch sử trước khi sửa ngữ cảnh. Khi khởi động lại, dùng các bundle trong lệnh cuối tài liệu này để giữ ảnh nguồn của cả hai revision. Bằng chứng tại `research/BN1-mapping-fix-20261109-01/`.

## Cập nhật 09/11: duyệt cả xét nghiệm thuộc và không thuộc CRF

Phần **Trường dữ liệu** có hai bảng **Thuộc CRF** và **Không thuộc CRF**. Bộ lọc **Phạm vi** cho phép xem cả hai hoặc từng nhóm. Xét nghiệm bổ sung không còn nằm lẫn trong khung thông tin đầu phiếu. Hồ sơ BN-CEDF9FAAC410 có 17 trường / 17 kết quả không thuộc CRF, bên cạnh 261 mục / 377 thành phần CRF hiện có. Các số này không bao gồm ba dòng còn ở `unmapped_test` của lượt chấm BN-1.

Mỗi kết quả bổ sung có ô chọn, trạng thái, ảnh/crop và nút **Xem / sửa**. Có thể chọn các giá trị từ cả hai bảng rồi duyệt chung một đợt, hoặc lọc **Không thuộc CRF** để chỉ chọn nhóm bổ sung. **Chọn tất cả trong bộ lọc** chỉ chọn các giá trị phù hợp phạm vi đang xem; đổi bộ lọc giữ nguyên những giá trị đã chọn và bộ đếm nêu riêng số thuộc/không thuộc CRF. Thông tin đầu phiếu và thu mẫu vẫn ở khung riêng, chỉ được chọn cùng bảng khi phạm vi là cả hai và phù hợp bộ lọc.

Với 17 kết quả bổ sung trên, khung sửa cho phép chép lại kết quả và đơn vị. Bản sửa là đề xuất, chỉ thay giá trị đang dùng sau khi người dùng duyệt bản sửa có bằng chứng và lý do. Các kết quả phức tạp đã có diễn giải từ ký hiệu/legend chỉ cho sửa đơn vị ở trình sửa này để tránh giữ diễn giải cũ khi thay chỉ số. Không nhận JSON tùy ý, không tự gán lại trường CRF hoặc suy luận ngưỡng lâm sàng.

API giữ nguyên `workspace.fields` là danh mục CRF, bổ sung `workspace.supplemental_fields` với `crf_membership=non_crf` và tham chiếu tới cùng `selection_id` hiện hữu. `counts.non_crf_fields` / `non_crf_results` phân biệt số trường và số lần đo. Nhiều phiếu có cùng xét nghiệm được gom dưới một trường, nhưng mỗi kết quả/ngày/nguồn vẫn có ô chọn và lịch sử riêng. Dữ liệu gốc và cách lưu/xuất metadata bổ sung không đổi; không di trú, nhân bản hoặc duyệt tự động các giá trị đang có.

Các đoạn số liệu và bố cục bên dưới mô tả lịch sử trước cập nhật này.

Trang chính đã rút gọn thành **xem → sửa → duyệt**. Chọn bệnh nhân ở đầu trang, xem dữ liệu và ảnh nguồn; bấm **Xem / sửa** để mở đúng giá trị trong khung bên cạnh. Xuất Word/REDCap, JSON, chọn gói dữ liệu và quản lý liên kết ca đã được đưa khỏi màn hình chính. Mặc định hiện mục có dữ liệu; chọn **Tất cả các trường** để xem đủ261mục/377thành phần.

Đưa ảnh mới vào tại khung **Thêm hồ sơ từ ảnh** ở đầu trang, mở sẵn: bấm **Chọn / thêm ảnh** một hoặc nhiều lần để cộng dồn danh sách, bỏ ảnh không cần rồi gửi một lượt. Một lượt nhiều ảnh tạo một bệnh nhân, OCR chạy nền và kết quả chờ duyệt. [Hướng dẫn gửi ảnh và phục hồi lỗi](PATIENT-IMAGE-INTAKE.md).

Đã sửa điều hướng ảnh khi bấm nhiều giá trị liên tiếp: chỉ lần chọn mới nhất được mở, ảnh cũ được xóa trong lúc tải, chữ OCR giữ đúng crop đang chọn. Sau khi cập nhật, tải lại trang để dùng bản sửa. Ảnh gốc của một giá trị có thể đi cùng nhiều crop kết quả/ngày; từng crop vẫn thuộc đúng tài liệu đó.

Trong khung **Xem / sửa**, kết quả xét nghiệm có nút **Duyệt** và **Lưu sửa và duyệt**. [Thông tin trên phiếu và thu mẫu](SOURCE-CORRECTIONS.md) dùng đề xuất sửa rồi duyệt riêng; giá trị hiện hành được giữ cho đến khi duyệt bản sửa. Mở/đóng khung xem không bỏ các ô đã chọn trên bảng. Đóng bằng nút **Đóng**, Escape hoặc bấm vùng ngoài khung.

Mở **http://127.0.0.1:8773**. Chọn **Bệnh nhân**. Bảng giữ đủ **261 mục / 377 thành phần** theo danh mục Word, bao gồm mục chưa có ứng viên hoặc chưa triển khai parser qua bộ lọc. Chưa cần sắp bố cục như Word.

Cập nhật trích xuất: đã thêm **66 ứng viên chờ duyệt**, giữ nguyên 175 kết quả đã duyệt. Hiện có 93 mục có ứng viên, 184 observations, 113 metadata và 3 specimens. Xem phạm vi, nhãn bản chép tay của trợ lý và giới hạn tại [SOURCE-EXTRACTION-IMPROVEMENTS.md](SOURCE-EXTRACTION-IMPROVEMENTS.md). Các số 91 mục/175 kết quả bên dưới mô tả mốc trước đợt bổ sung.

## Thao tác duyệt

1. Nhập tên người duyệt ở đầu trang.
2. Lọc theo nhóm mục, tên/mã trường, giá trị hoặc mã ảnh. Có thể xem tất cả, chỉ có dữ liệu, cần duyệt/làm rõ hoặc chưa có dữ liệu.
3. Mở ảnh/crop để đối chiếu. Mỗi giá trị giữ riêng đơn vị, ngày nguồn, ký hiệu thiếu và trạng thái. Thông tin nguồn/phiếu mẫu bổ sung nằm dưới bảng.
4. Chọn các giá trị cần duyệt hoặc **Chọn tất cả trong bộ lọc**. Lệnh này gồm cả thông tin trên phiếu và thu mẫu phù hợp bộ lọc, kể cả khi phần bổ sung đang thu gọn. Bộ đếm nêu riêng từng loại. Thay bộ lọc không tự bỏ các giá trị đã chọn; dùng **Bỏ chọn** để bắt đầu lại.
5. Chọn Duyệt, Cần xem lại, Loại hoặc Bỏ duyệt. Nhập ghi chú, đánh dấu xác nhận rồi **Lưu duyệt** một lần.

Một giao dịch SQL lưu tất cả quyết định của đợt; lỗi ở bất kỳ giá trị nào sẽ hoàn tác cả đợt. Dữ liệu, revision, quyết định hoặc liên kết thay đổi sau khi tải bảng sẽ bị chặn và yêu cầu tải lại. Gửi lại cùng yêu cầu sau lỗi mạng không tạo đợt trùng. Mỗi đợt lưu người duyệt, thời gian, ghi chú, số lượng và các quyết định trong lịch sử. Các kết quả phiên bản cũ chỉ cho đối chiếu; mâu thuẫn cần xử lý trước khi duyệt hàng loạt.

Các kết quả xét nghiệm được chấp nhận cho bệnh nhân ở mức **source_verified**. Thông tin nguồn và phiếu mẫu dùng phê duyệt nguồn hiện hành. Duyệt hàng loạt không sửa OCR gốc, không nâng thành đánh giá lâm sàng, không cấp Study ID, gán ngày thiếu hoặc tạo lần khám. Giá trị đã sửa trước đó được giữ khi duyệt lại. Quyết định đối chiếu bản OCR gốc của xét nghiệm vẫn là lịch sử riêng, không bị tự đổi bởi thao tác chấp nhận giá trị bệnh nhân.

## Trường chưa có dữ liệu

Ô trống vẫn hiện với nhãn và thành phần. Không thể chọn ô trống để duyệt thành Không, âm tính, 0 hoặc điểm bệnh. **Chưa có dữ liệu trích xuất** không khẳng định nguồn không có thông tin; có thể parser chưa hỗ trợ hoặc chưa lấy được ứng viên. Mục đánh giá cần thông tin/đánh giá lâm sàng được ghi rõ. Ký hiệu `---` là placeholder có trên nguồn, không phải giá trị số.

**Đủ cấu trúc trường không đồng nghĩa đã trích đủ giá trị của bệnh nhân.** Hồ sơ LUPUS-000001 hiện có dữ liệu ở91mục,175kết quả,56thông tin nguồn và3mục thu mẫu từ12ảnh. Đây không phải phép đo độ chính xác OCR. Những phê duyệt cũ được giữ nguyên; lần triển khai bảng không tự tạo đợt duyệt mới.

## Dữ liệu tải xuống và API

API JSON vẫn chứa snapshot bệnh nhân, `workspace.fields` đủ261mục/377thành phần và `workspace.candidates` gồm cả giá trị đã duyệt, đang chờ và bị loại/cần làm rõ trong phạm vi tài liệu liên kết. Nút tải JSON đã đưa khỏi trang chính. `components[].candidate_ids` nối đến `candidates[].selection_id`. Ô không có ứng viên giữ danh sách rỗng và trạng thái rõ ràng. Ngày và nguồn từng kết quả vẫn riêng; không flatten thành giá trị mới nhất.

Myositis có bảng nguồn Intensity/Class được hiển thị đúng hai thành phần, ví dụ `Intensity: 17 · Class: o`. Diễn giải Negative nằm ở dòng chú thích riêng; đó không phải cột thứ ba được OCR trên hàng xét nghiệm. Các phiếu có cột Result ghi sẵn cả số và chữ vẫn giữ cả hai. Parser giữ `class_raw` nguyên văn và chỉ thêm `class_symbol=o` khi ký hiệu tròn o/O/0, chú giải cùng tài liệu, khoảng cường độ duy nhất và giá trị số đồng thuận. Khoảng lấy từ từng nguồn, không cố định ngưỡng của một phiếu. Lưu riêng `class_interpretation_origin=source_legend` và bằng chứng; không đoán Class từ cường độ khi thiếu ký hiệu/chú giải. Thay đổi này không sửa thuật toán chấm điểm, tự duyệt hoặc viết lại dữ liệu đã lưu.

Khi đã nhập một lượt OCR mới để thay phần hiển thị của cùng bộ tài liệu, UI mặc định hiện lượt mới. **Hiện dữ liệu trước đó và các đề xuất sửa đang chờ** mở lại nguồn trước; quyết định duyệt và đề xuất sửa vẫn gắn với nguồn gốc của chúng. Việc đổi phần hiển thị không tự duyệt kết quả OCR mới hoặc thay dữ liệu xuất đã được duyệt. Chính sách này chỉ dùng khi package có quan hệ thay UI rõ ràng, hashgói cũ khớp và cùngdocumenthash; các gói bổ sung thông thường không bị ẩn.

- `GET /api/patient?case_id=...`: bảng dữ liệu và workspace để review.
- `GET /api/patient/export?case_id=...`: tải `patient-fields.json`.
- `POST /api/patient-review`: case_id, selection_ids, action, request_id, expected_snapshot_sha256, actor, role, reason. Dùng token/header cùng luồng review hiện có. Không nhận đường dẫn file hoặc giá trị sửa tùy ý qua bulk endpoint.

CSV REDCap/Word vẫn dùng luồng xem trước/xuất đã có, chỉ lấy dữ liệu đủ điều kiện xuất. Word bindings vẫn63/261mục; bảng đủ trường và JSON không phụ thuộc các bindings này. Chưa thử import trên REDCap thật.

Chạy lại server từ thư mục dự án:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 -m registry_review.server --db research/registry-pool/registry-20261106-01.sqlite --bundle research/ocr-pool/bundle-20261107-registry-revision4 --bundle research/ocr-pool/bundle-20261107-registry-revision5-complete --bundle research/ocr-pool/bundle-20261108-source-supplement-03 --bundle research/BN1-mapping-fix-20261109-01/bundle --bundle research/BN1-mapping-fix-20261109-01/bundle-v2 --bundle research/BN3-general-fix-20261109-01/bundle --bundle research/bn3-full-rerun-20261110-01/bundle-live-r3 --bundle research/inputs-ui-update-20261110-01/bundle --port 8773 --export-dir outputs/patient-inputs-20261107-01 --export-template "260825_Vivi_MDDU_CRF_SLE_AI thực chiến.docx" --export-ledger outputs/patient-inputs-20261107-01/redcap-instances.sqlite --redcap-project lupus-inputs-patient-01
```

Giữ cùng ledger và project namespace khi xuất cập nhật cho cùng REDCap project. Đây là bản thử localhost với vai trò khai báo; chưa có xác thực nhiều người dùng. Kiểm thử HTTP/Python và controller JS đã chạy; chưa kiểm trực quan trên trình duyệt vì Computer Use native pipe không khả dụng.
