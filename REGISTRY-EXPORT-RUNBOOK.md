# Xuất SQL sang REDCap và Word

**Cập nhật giao diện09/11:** người dùng yêu cầu trang chỉ dành cho xem/sửa/duyệt, nên phần xuất đã đưa khỏi màn hình chính. CLI/API xuất và ledger vẫn giữ nguyên. Các bước xuất bằng nút giao diện bên dưới mô tả bản trước khi rút gọn.

Lệnh `scripts/export_registry.py` tạo bộ biến REDCap mới dựa trên Word và xuất dữ liệu từ kho SQL cục bộ. Không chạy lại OCR, không tạo quyết định duyệt và không tải hồ sơ lên dịch vụ ngoài. SQLite nguồn mở bằng `mode=ro` và `query_only`, trong một read transaction.

## Xuất trực tiếp trên màn hình review

Khởi động review với mẫu Word và vị trí lưu file do máy chủ cấu hình:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 -m registry_review.server --db LOCAL-REGISTRY.sqlite --bundle LOCAL-BUNDLE --port 8770 --export-template '260825_Vivi_MDDU_CRF_SLE_AI thực chiến.docx' --export-dir outputs/review-exports --export-ledger LOCAL-REDCAP-INSTANCES.sqlite --redcap-project my-redcap-project
```

Chỉ thêm `--synthetic` cho SQL hoàn toàn giả lập. Nếu không cung cấp mẫu Word, vẫn xuất CSV REDCap được; màn hình ghi rõ lý do Word chưa dùng được. Mặc định file được lưu trong `review-exports/<tên SQL>/` cạnh SQL; ledger mặc định nằm trong thư mục đó. Khi cập nhật cùng project REDCap, luôn cấu hình đúng ledger và project đã dùng trước đây.

1. Mở địa chỉ review, đến **Xuất dữ liệu sang REDCap / Word**, chọn hồ sơ bệnh nhân. Bảng bên dưới hiển thị mọi kết quả cùng ngày và mã ảnh nguồn; có thể lọc theo chỉ số, giá trị hoặc mã ảnh. Metadata, mẫu và trạng thái đủ danh mục nằm trong các phần mở rộng.
2. Bấm **Xem trước dữ liệu xuất**. Báo cáo phân biệt số kết quả được chấp nhận cho ca, metadata/mẫu đã duyệt nguồn, mục bị loại và lý do. Số mục toàn kho chưa liên kết ca hiển thị riêng, không cộng vào số bị loại của ca.
3. **Tạo CSV REDCap** lấy toàn bộ dữ liệu của bệnh nhân. Phạm vi Word mặc định là **Toàn bộ hồ sơ bệnh nhân**; chọn một lần ghi nhận nếu chỉ muốn xuất lần đó. Nút Word bị khóa nếu phạm vi chưa có kết quả được chấp nhận hoặc mẫu không hợp lệ. Không chọn lần ghi nhận không làm phát sinh một lần khám giả.
4. Tải CSV hoặc Word, `pool-snapshot.json` và `export-report.json` từ các liên kết hiện ra. Mỗi lượt tạo có thư mục riêng; không ghi đè bản cũ. Word vẫn cần kiểm tra bố cục trước khi dùng. CSV dictionary đi kèm chưa tự bật repeating instruments trên REDCap.

Bản xem trước hết hạn sau 30 phút. Nếu duyệt, sửa, rút liên kết hoặc cấu hình thay đổi sau khi xem trước, máy chủ yêu cầu xem trước lại. Bundle nguồn được kiểm tra hash trước khi tạo file. Chỉ các file tạo thành công, nằm trong danh sách cho phép mới có liên kết tải; file bị sửa trên đĩa sẽ không tải được. Liên kết tải có hiệu lực trong phiên máy chủ hiện tại; file vẫn nằm trên đĩa sau khi khởi động lại. Không có upload tự động lên REDCap.

Đối soát ledger của CSV xuất riêng ca chỉ xét những dòng từng xuất của ca đó. Dữ liệu ca khác không bị báo nhầm là đã biến mất. Nếu có `reconciliation_required`, đối chiếu thủ công trên REDCap; CSV không tự xóa dòng cũ.

## Bộ biến mới từ Word

Thiết kế dự thảo có 5 form, 70 biến dùng chung. **261 mục Word/377 component được mã hóa qua cặp `field_id` + `component`**, không phải 261 cột riêng. Mỗi quan sát đã chấp nhận là một dòng trong form lặp `pool_results`. Thiết kế này giữ nhiều kết quả cùng chỉ số ở các ngày, phiếu và lần khám khác nhau. Bộ từ điển ngữ nghĩa vẫn cần người phụ trách rà soát; có mapping đầy đủ không có nghĩa OCR đã đọc được mọi mục.

| Form | Dữ liệu | Lặp |
|---|---|---|
| `registry_profile` | record_id, registry_code, case_id, study_id, is_synthetic | Không |
| `registry_visits` | Mã lần ghi nhận, nhãn, loại, ngày | Có |
| `pool_results` | field/component, giá trị, đơn vị, dấu, ngày, kiểu kết quả, nguồn, quyết định | Có |
| `source_metadata` | Thông tin nguồn đã đối chiếu, mã phiếu/SID/PID nếu có | Có |
| `sample_collection` | Thông tin thu mẫu đã đối chiếu, số lượng, thời gian, checkbox | Có |

`record_id` lấy từ `registry_code` đã được người vận hành tạo. Study ID chỉ lấy từ thuộc tính study_id được xác nhận; SID/PID không tự thay thế nó. Các form lặp chứa mã visit_id rõ ràng để nối với lần khám. Đây là project không longitudinal; không tự sinh redcap_event_name.

`numeric_value`, `source_date` và giá trị gốc giữ dạng text để bảo toàn số thập phân, độ chính xác ngày/giờ và múi giờ. Comparator nằm ở cột riêng. Không suy ngày xét nghiệm từ ngày khám; không đổi đơn vị hoặc tự tính điểm SLEDAI/EULAR. Giá trị thiếu giữ trống; placeholder `---` giữ trong result_raw với missing_reason. `+`, `++`, `+++` giữ nguyên; không tự gán mức độ nếu nguồn không có chú giải.

## Tạo schema

Chạy từ gốc repository, dùng đường dẫn output mới mỗi lượt:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/export_registry.py schema --template '260825_Vivi_MDDU_CRF_SLE_AI thực chiến.docx' --out outputs/my-schema
```

Nhận `redcap-data-dictionary.csv`, `component-mapping.csv` (377 dòng), `word-redcap-mapping.json` và `project-setup.json`. Kiểm tra hash mẫu Word khớp dictionary trước khi tạo. Mẫu gốc phải được giữ cục bộ, không nằm trong Git.

## Thử nhập REDCap

1. Tạo project REDCap **Development** mới, không bật longitudinal cho thiết kế này. Dùng project thử riêng cho dữ liệu giả lập.
2. Trong **Data Dictionary**, upload `redcap-data-dictionary.csv`, kiểm tra cảnh báo trước khi lưu.
3. Trong **Project Setup → Enable optional modules and customizations → Repeating instruments and events**, bật lặp cho đúng 4 form: `registry_visits`, `pool_results`, `source_metadata`, `sample_collection`. CSV Data Dictionary không tự bật được tùy chọn này.
4. Trong **Data Import Tool**, chọn định dạng CSV với tên biến, upload `redcap-import.csv`. Xem bảng thay đổi trước khi import. Số hồ sơ, visit_id, repeat instance, field/component, đơn vị và nguồn phải khớp báo cáo cục bộ.
5. Export lại raw values từ REDCap để đối chiếu các mã, giá trị và repeat instances. Bản hiện tại chưa được thử trên máy chủ REDCap cụ thể; không coi kiểm tra CSV cục bộ là xác nhận import thực tế.

CSV import giữ nguyên literal, kể cả chuỗi bắt đầu bằng `+` hoặc `=`. Khi xem bằng Excel, dùng **Data → From Text/CSV** và chọn kiểu Text để không đổi mã có số 0 đầu hoặc diễn giải thành công thức. Không lưu đè file import qua Excel.

## Xuất dữ liệu đã duyệt

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/export_registry.py check --db LOCAL-REGISTRY.sqlite --out outputs/readiness-01
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/export_registry.py data --db LOCAL-REGISTRY.sqlite --ledger LOCAL-REDCAP-INSTANCES.sqlite --project my-redcap-project --out outputs/data-01
```

Chỉ thêm `--synthetic` nếu toàn bộ SQL nguồn là fixture giả lập. Cờ này ghi nhãn dữ liệu, không khử định danh dữ liệu thật.

- Kết quả: chỉ lấy từ `effective_pool`, có chấp nhận/sửa tường minh cho ca và liên kết tài liệu còn hiệu lực. Loại pending, withdrawn, rejected và giá trị mâu thuẫn giữa các revision. Không tự chọn kết quả mới nhất giữa các lần đo.
- Metadata/mẫu: chỉ lấy các mục đã duyệt nguồn ở revision mới nhất của từng package, có liên kết tài liệu với ca được xác nhận. Chúng vẫn có trạng thái **source_verified**, không được nâng thành đã chấp nhận lâm sàng cho ca. Phần JSON giữ cờ case_acceptance_required. Checkbox thu mẫu không có nghĩa bệnh nhân mắc/không mắc bệnh.
- Trường không có giá trị đã chấp nhận được giữ trong `pool-snapshot.json` đủ 261 mục/377 component cho từng ca. Trạng thái no_accepted_value không đồng nghĩa âm tính hoặc OCR đã tìm hết tài liệu. Chi tiết mục bị loại nằm trong excluded.
- Kho chỉ có duyệt nguồn mà chưa xác nhận ca sẽ báo blocked_no_confirmed_registry_cases; không tạo CSV bệnh nhân.

Giữ **cùng file ledger và project namespace cho mọi lần xuất vào cùng project REDCap**. Ledger lưu `(record_id, form, source entity) → repeat_instance`, nằm riêng SQL nguồn. Thêm kết quả không đánh lại số các dòng cũ; sửa giá trị giữ nguyên instance. Khi rút duyệt/gỡ liên kết, báo cáo `reconciliation_required` liệt kê dòng đã xuất trước đây nhưng nay vắng mặt. CSV không xóa hoặc làm trống dữ liệu cũ trên REDCap; phải đối chiếu và xử lý các dòng đó. Không dùng một ledger mới để cập nhật project đã có dữ liệu. Sao lưu ledger cùng các lần export.

## Điền Word cho bệnh nhân hoặc một lần ghi nhận

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/export_registry.py word --db LOCAL-REGISTRY.sqlite --template '260825_Vivi_MDDU_CRF_SLE_AI thực chiến.docx' --mapping outputs/my-schema/word-redcap-mapping.json --record REGISTRY-CODE --visit CONFIRMED-ENCOUNTER-ID --out outputs/word-01
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/export_registry.py word --db LOCAL-REGISTRY.sqlite --template '260825_Vivi_MDDU_CRF_SLE_AI thực chiến.docx' --mapping outputs/my-schema/word-redcap-mapping.json --record REGISTRY-CODE --patient --out outputs/patient-word-01
```

Xuất `filled-crf.docx`, snapshot và report. Chọn tường minh `--patient` cho mọi kết quả của bệnh nhân hoặc `--visit` cho một lần ghi nhận đã xác nhận. Bản tổng hợp giữ mọi lần đo và ngày nguồn, không lấy một kết quả mới nhất và không suy lần khám. Chỉ điền khi khớp hash mẫu, nhãn bên cạnh và placeholder. Hiện **63/261 mục** có binding chính xác; 198 mục còn unresolved, gồm nhiều ô gộp, checkbox, slot PFT lặp và bảng ghép. Giá trị chưa gắn ô được giữ trong phụ lục có nhãn, không tự đánh dấu ô. Các giá trị đã điền cũng có nguồn trong phụ lục.

Giữ nguyên mọi ZIP member ngoài document.xml và settings.xml; settings chỉ yêu cầu Word refresh PAGE fields. Mẫu gốc giữ nguyên. Bản sinh tự động cần render và kiểm tra các trang trước khi sử dụng; CLI không tự chứng nhận bố cục cho mọi độ dài dữ liệu. Metadata/mẫu vẫn có trong snapshot, không tự điền vào ô lâm sàng.

## Gắn các ảnh đã duyệt nguồn vào một bệnh nhân

Khi người dùng xác nhận tường minh một danh sách ảnh cùng bệnh nhân và muốn dùng các giá trị đã duyệt nguồn, `scripts/link_patient_sources.py` ghi một batch có thể thử lại an toàn. File authorization cục bộ chứa đúng document IDs, hash package, mã registry và nguyên văn xác nhận; scope phải là `one_patient_existing_source_approvals_no_inferred_visits`. CLI yêu cầu backup và receipt mới:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/link_patient_sources.py --db LOCAL-REGISTRY.sqlite --bundle EXACT-REVIEWED-BUNDLE --authorization LOCAL-AUTHORIZATION.json --receipt NEW-RECEIPT.json --backup NEW-BACKUP.sqlite
```

Batch dùng transaction chung cho tạo ca, liên kết tài liệu và chấp nhận đúng giá trị đang có source approval. Lỗi bất kỳ rollback toàn bộ, cùng request ID không tạo bản trùng, khác nội dung cùng request ID bị từ chối. Không tự gộp vào ca đang có hoặc thay liên kết cũ. Người dùng là người xác nhận qua hội thoại, Codex là recorder riêng; mọi review có source_review_id và origin/quote. Trạng thái là source_verified, không tự nâng thành clinically_assessed. Không tạo lần khám, không suy ngày từ tên file hoặc ghi PID/SID làm Study ID.

Hồ sơ từ ảnh `examples/inputs` đã được người dùng xác nhận cùng bệnh nhân và lưu dưới mã nội bộ **LUPUS-000001**: 12 tài liệu, 175 kết quả ở 91 mục danh mục, 56 metadata, 3 dòng mẫu; CSV235dòng. Có 135 kết quả có ngày nguồn, 40 chưa có ngày. IN03 là ảnh biểu đồ PFT, được giữ trong danh sách nguồn; không tự đọc tọa độ đồ thị thành số đo. Word tổng hợp có53quan sát vào các ô đã xác định và122quan sát chưa có ô an toàn được giữ tại phụ lục. Kho và receipt/bản backup đều ở máy phát triển; không nằm trong Git. Review hiện tại ở cổng8771.

## Bản thử ngày 07/11/2026

Thư mục `outputs/registry-export-20261107/` giữ schema và kết quả thử hoàn toàn giả lập. CSV có 3 profile, 4 visit, 9 kết quả đã chấp nhận trong mô phỏng và 8 metadata đã duyệt nguồn, tổng 24 dòng. DEMO-003 giữ profile/visit nhưng 2 kết quả và 3 mẫu đang pending không được xuất. Word DEMO-002 điền 5 giá trị Hb, WBC, PLT, C3, C4; source_date vẫn trống vì fixture không ghi ngày tại quan sát, dù visit_date có giá trị.

Đây là kiểm thử exporter từ SQL giả lập, không phải phép đo độ chính xác OCR trên ảnh mới. Các artifacts cục bộ và mọi dữ liệu y tế trong `outputs/`, `research/` bị loại khỏi Git.
