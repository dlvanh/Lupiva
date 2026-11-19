# Lupiva · Lupus Registry

Cập nhật 09/11 — đã sửa alias UPCR tên đầy đủ kèm viết tắt và biến thể OCR “huyền quang” trong tên ANA (`lupus-table-rules-0.5`); giữ raw/evidence, phương pháp có cờ spelling variant. Sửa ngữ cảnh khi đổi mục trong bảng tự động để ANA không kế thừa urine từ UPCR. Gói bổ sung cached OCR `research/BN1-mapping-fix-20261109-01/bundle-v2`, cùng package ID revision 2, có 3 ứng viên pending (REN01 result, IMM01 result/method), giữ revision 1 làm lịch sử. Không chạy OCR lại, không đổi 88 ứng viên cũ/phê duyệt/liên kết. 143 Python tests và 2 controller JS đạt, Chrome extension kiểm thực tế cả hai trường và editor ANA có specimen trống. Xem lệnh server đầy đủ có 5 bundle CLI trong PATIENT-FIELDS-REVIEW; completed intake bundle tự đăng ký thêm khi startup.

Cập nhật 09/11 — trường dữ liệu chia **Thuộc CRF / Không thuộc CRF**, có bộ lọc phạm vi và duyệt chung hai nhóm. `workspace.supplemental_fields` dựng bảng xét nghiệm bổ sung từ metadata hiện hữu, không đổi ID, dữ liệu nguồn hoặc lịch sử. 17 kết quả của BN-CEDF9FAAC410 đã hiện trên bảng riêng; xem/sửa kết quả và đơn vị bằng đề xuất rồi duyệt. 83 kiểm thử Python và 5 controller JS đạt; đã kiểm trực tiếp qua Chrome extension: 17 dòng, chọn 17, HCT đúng giá trị/đơn vị và ảnh; cả hai nhóm hiện đồng thời. Server 8773 đã nạp bản mới; không ghi quyết định duyệt hoặc sửa dữ liệu thật. Bằng chứng tại `research/non-crf-fields-20261109-01/`.

Cập nhật lỗi xuất09/11: SQLite candidate exporter chấp nhận evidence metadata theo vùng chữ/raw span không có hàng bảng (`row_index=NULL`), giữ đầy đủ payload; evidence bảng thiếu hàng vẫn bị chặn. Đã khôi phục lượt nhập3ảnh mới từ finalOCR đã xác minh sang publication workflow mới, không inference lại hoặc tạo approval:47observations/41metadata pending,40fields có ứng viên, đủ261/377catalog.78tests liên quan đạt; kiểm mainSQL integrity/FK và nguồn/crop/rawHTTP đạt. Đây là hoàn tất chức năng nhập/xuất; còn các cảnh báo ánh xạ để người dùng đối chiếu, chưa có đánh giá độ chính xác độc lập trên bộ ảnh mới.

Cập nhật09/11 — **Thêm hồ sơ từ ảnh** nằm đầu trang và mở sẵn. **Chọn / thêm ảnh** cộng dồn nhiều lần chọn, hiện tên/thứ tự/dung lượng và cho bỏ ảnh trước khi gửi; SHA256 loại ảnh trùng nội dung, giới hạn tổng50ảnh/100MiB. Sau khi tạo lượt gửi, khóa bộ ảnh để retry không đổi IDs/thứ tự hoặc tạo trùng bệnh nhân. Đã kiểm trực tiếp bằng Chrome/ChatGPT extension: chọn2ảnh giả → thêm1ảnh và1ảnh trùng → còn3ảnh → bỏ1còn2 → xóa lựa chọn để người dùng nhập ảnh thật. Không POST vào SQL thật; kiểm tra này không thay thế đánh giá OCR trên ảnh mới hoặc visual QA toàn bộ editor/export. Người dùng yêu cầu từ đây chỉ điều khiển tab Chrome qua extension, không dùng điều khiển cửa sổ native.

Trang review hiện được rút gọn theo yêu cầu người dùng: chọn bệnh nhân, xem/lọc dữ liệu và ảnh, sửa từng giá trị trong khung bên cạnh, duyệt từng giá trị hoặc hàng loạt. Thêm ảnh nằm trong mục thu gọn. Các UI kỹ thuật/quản lý ca/xuất JSON/Word/REDCap được giữ ẩn để tương thích controller, không nằm trên trang chính; các API/CLI và dữ liệu cũ giữ nguyên. Mặc định hiển thị mục có dữ liệu, vẫn có bộ lọc đủ danh mục. Startup chỉ lấy summary/patient/intakes, không tải cấu hình xuất hoặc package không dùng. Mở khung xem giữ lựa chọn duyệt, chỉ hiển thị đúng observation/metadata/specimen đã chọn. **5 JS smokes và25HTTP server tests đạt**, kiểm live page/API chỉ đọc đạt; native Computer Use pipe chưa khả dụng nên chưa visual QA.

Luồng chính09/11: [gửi nhiều ảnh của một bệnh nhân → tạo hồ sơ → OCR → kiểm tra/sửa/duyệt](PATIENT-IMAGE-INTAKE.md). Mỗi lượt gửi tạo đúng một bệnh nhân với đủ261mục/377thành phần ngay từ đầu. Ảnh gốc được lưu, OCR chạy nền, dữ liệu chờ người dùng duyệt; retry giữ nguyên bệnh nhân và nguồn. Không cần import/link/duyệt từng tài liệu trước khi có hồ sơ.

[Đề xuất sửa metadata/thu mẫu](SOURCE-CORRECTIONS.md) giữ nguyên OCR và giá trị đang hiệu lực; duyệt rõ từng bản sửa trước khi áp dụng vào workspace/export. Có thể bỏ đề xuất mà không rút giá trị hiện hành. Lý do trường trống dựa vào dictionary và tài liệu của bệnh nhân, không dùng báo cáo12ảnh làm quy tắc cho nguồn mới. Browser visual QA chưa khả dụng.

Kiểm tra mới nhất: **247 Python tests + 4 JS controller smokes đạt**. Pilot upload HTTP → OCR bằng model thật trên ảnh hoàn toàn giả mới → bệnh nhân/full catalog/5ứng viên pending đạt, không tạo approval; kiểm nguồn/crop/raw và restart đạt. Đây là kiểm tra chức năng, chưa đo độ chính xác trên bệnh án thực tế mới.

Kiểm tra điều hướng ảnh09/11: đã tái hiện và sửa trường hợp bấm A rồi B nhưng phản hồi A về chậm kéo màn hình về A. Chỉ lượt chọn mới nhất được hiển thị; xóa ảnh cũ khi tải và chặn raw OCR cũ thay nội dung của crop mới. **5 JS controller smokes và25HTTP server tests đạt**. Audit toàn bộ300candidates:300source links,613crop links,156assetsHTTP,68vùng crop tái tạo khớp nguồn từng pixel; không phát hiện liên kết sai trong snapshot hiện tại. Chưa browser visual QA.

Cập nhật trích xuất08/11:66ứng viên nguồn mới chờ duyệt, không thay175kết quả đã duyệt;93mục Word có ứng viên và35kết quả bổ sung ngoài danh mục. Server **http://127.0.0.1:8773**; [chi tiết triển khai, kiểm thử và giới hạn](SOURCE-EXTRACTION-IMPROVEMENTS.md). Bộ kiểm tra hiện220Python tests+2JSsmokes.

Ứng dụng thử nghiệm xử lý hồ sơ lupus cục bộ: ảnh nguồn → layout/OCR → pool dữ liệu có bằng chứng → đối chiếu, duyệt và lưu lịch sử → xuất REDCap/Word dự thảo.

## Thành phần

- `ocr_pool/`: đọc bảng, chuẩn hóa kết quả và metadata, workflow có hash/resume.
- `form_pool/`: dữ liệu thu mẫu, checkbox, đọc lại ô nguồn và tích hợp specimen.
- `registry_pool/`: dictionary, schema, bundle có hash, SQLite importer và revisions.
- `registry_review/`: giao diện localhost, duyệt nguồn, xác nhận ca/lần ghi nhận, lịch sử, xuất JSON và xem trước/tải REDCap/Word.
- `registry_export/`: xuất SQL chỉ đọc sang Data Dictionary/CSV REDCap dự thảo và Word theo mapping có hash, ledger instance riêng.
- `schemas/`: danh mục dự thảo 261 mục/377 component và JSON schemas.
- `tests/`, `examples/pool-tests/`: kiểm thử và ảnh/bảng hoàn toàn giả.

Mọi inference chạy tại máy với SenOCR-Vi và PP-DocLayoutV3. Các giá trị thiếu giữ nguyên; không tự suy điểm bệnh, gộp người hoặc thay PID/SID thành Study ID. Duyệt nguồn và chấp nhận kết quả cho ca/lần khám có phạm vi riêng.

## Kiểm thử

Python 3.11. Bộ kiểm thử không cần GPU, model hay hồ sơ thật; cần Pillow, NumPy và OpenCV headless:

```powershell
py -3.11 -m venv .venv-test
.\.venv-test\Scripts\python.exe -m pip install -r requirements-test.txt
.\.venv-test\Scripts\python.exe -X utf8 -m unittest discover -s tests
node tests/review_export_ui_smoke.cjs
node tests/review_patient_ui_smoke.cjs
node tests/review_source_correction_ui_smoke.cjs
node tests/review_intake_ui_smoke.cjs
node tests/review_source_navigation_ui_smoke.cjs
```

Môi trường OCR đang dùng tại máy phát triển là `.venv-senocr`; giữ nguyên torch/CUDA hiện có. `scripts/setup_senocr_local.ps1` yêu cầu môi trường có PyTorch/CUDA trước khi cài phần OCR và tải model. `scripts/setup_layout_local.py` tải model layout. Model và môi trường ảo không nằm trong Git.

## Chạy OCR và review

Xem [runbook OCR](OCR-POOL-RUNBOOK.md) để chạy từ manifest ảnh hoặc tiếp tục phần form từ clinical run đã lưu. Runner whole-image có 30 stage; resume chỉ hợp lệ khi inputs/code/schema/model/settings và artifact đã hoàn tất còn đúng hash.

Với kho đã có, khởi động server rồi gửi ảnh mới ngay trên giao diện:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 -m registry_review.server --db LOCAL-REGISTRY.sqlite --bundle LOCAL-BUNDLE --port 8766
```

Mở `http://127.0.0.1:8766`, dùng **Tạo hồ sơ bệnh nhân từ ảnh**. [Hướng dẫn nhận ảnh](PATIENT-IMAGE-INTAKE.md) mô tả luồng chính; [runbook duyệt](POOL-REVIEW-RUNBOOK.md) mô tả duyệt nguồn, liên kết ca/lần khám thủ công, rút quyết định và các dạng xuất JSON. Đây là bản thử một máy với vai trò khai báo, chưa có đăng nhập cho nhiều người dùng.

[Hướng dẫn xuất từ màn hình review](REGISTRY-EXPORT-RUNBOOK.md#xuất-trực-tiếp-trên-màn-hình-review) mô tả cấu hình mẫu Word, thư mục đầu ra và ledger REDCap. Chọn bệnh nhân để xem bảng kết quả/ngày/nguồn, metadata, mẫu và đủ danh mục trường. CSV lấy toàn ca; Word cho phép toàn bộ hồ sơ hoặc lần ghi nhận đã chọn. Cả hai yêu cầu xem trước và chặn dữ liệu đã thay đổi. Kiểm thử JavaScript ở trên chạy controller với DOM giả, không thay thế kiểm tra giao diện trên trình duyệt.

`scripts/link_patient_sources.py` ghi liên kết bệnh nhân theo chỉ dẫn tường minh và dùng các giá trị đã duyệt nguồn, có backup, atomic batch, idempotency và tách người xác nhận với recorder. Không tạo visit hoặc đánh giá lâm sàng. Chi tiết scope và authorization nằm trong runbook export.

[Bảng đầy đủ trường và duyệt hàng loạt](PATIENT-FIELDS-REVIEW.md) hiển thị261mục/377thành phần cùng các ứng viên ở mọi trạng thái trong phạm vi bệnh nhân. `registry_review/workspace.py` tạo view có snapshot hash và lưu đợt duyệt trong một giao dịch SQL, gồm chấp nhận kết quả cho bệnh nhân và phê duyệt nguồn cho metadata/mẫu. Các ô trống không trở thành giá trị được duyệt; chỉnh giá trị xét nghiệm vẫn dùng màn hình đối chiếu từng kết quả. `GET /api/patient/export` tải toàn danh mục; `POST /api/patient-review` lưu đợt có idempotency/audit, chặn snapshot cũ, nguồn đổi và liên kết khác bệnh nhân. Server mới8772 giữ nguyên SQL và các phê duyệt trước khi người dùng tự lưu đợt mới.

## Dữ liệu cục bộ và phạm vi triển khai

Repository chứa mã nguồn, schema, tài liệu và dữ liệu thử giả. Ảnh/hồ sơ thật, OCR/reference/pool/SQLite thật, backups, model, notebook có outputs và cấu hình tài khoản được giữ tại máy và loại khỏi Git. Các đường dẫn `research/` trong tài liệu là lịch sử chạy tại máy phát triển; chúng không được tải lên repository.

Hiện có upload ảnh theo bệnh nhân, OCR nền, duyệt observations/metadata/specimens và xuất pool JSON giữ đủ danh mục. Bản thử export SQL có mapping261mục/377component, Data Dictionary REDCap mới và Word cho lần khám đã chọn; xem [hướng dẫn xuất](REGISTRY-EXPORT-RUNBOOK.md). Còn cần xác thực/phân quyền nhiều người dùng, thêm ảnh vào bệnh nhân hiện có, nhập thử trên REDCap thực tế, hoàn thiện binding Word (hiện63/261mục), editor metadata có cấu trúc, tạo ứng viên cho ô trống, liên kết mẫu/event chi tiết, bộ trích thuốc/lâm sàng và đánh giá trên hồ sơ mới. Xem [kế hoạch](POOL-DEVELOPMENT-PLAN.md). Báo cáo từng hồ sơ và bản bàn giao phiên làm việc được giữ tại máy cùng dữ liệu cục bộ.
