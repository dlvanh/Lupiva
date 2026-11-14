# Phát triển pool đầy đủ trường và chuẩn bị xuất REDCap/Word

## Cập nhật tiếp 08/11 — tăng dữ liệu có nguồn

Đã thêm66ứng viên pending vào SQL thật, giữ175kết quả đã duyệt. Hiện93/261mục có ứng viên, cùng35dòng xét nghiệm ngoài Word trong nhóm bổ sung. Có nhãn rõ bản trợ lý chép kết luận viết tay khi OCR thất bại, cảnh báo mapping vai trò người chỉ định và chẩn đoán nghi ngờ. **220Python tests và2JS smoke đạt**; HTTP45source/crop/rawlinks đạt. Server mới8773. Chi tiết và giới hạn: [SOURCE-EXTRACTION-IMPROVEMENTS.md](SOURCE-EXTRACTION-IMPROVEMENTS.md). Mốc213tests/8772 bên dưới là lịch sử.

## Cập nhật 08/11 — bảng đủ trường và duyệt nhiều giá trị

Theo yêu cầu người dùng, ưu tiên đủ trường và duyệt cùng lúc trước bố cục Word. Đã thêm workspace bệnh nhân đủ261mục/377thành phần, hiện cả ô chưa có dữ liệu với trạng thái rõ; không suy âm tính/Không/0. Bảng có các giá trị đang chờ hoặc đã loại/cần làm rõ, giữ nhiều nguồn/ngày, các mục metadata/mẫu bổ sung, lọc/tìm kiếm/chọn nhiều và tải JSON toàn danh mục. Bulk endpoint lưu một giao dịch có idempotency/snapshot/hash nguồn và audit theo đợt; giữ sửa tay cũ, không chấp nhận mâu thuẫn hoặc ô trống hàng loạt. **213Python tests và2JS smoke đạt**. SQL thật và175kết quả cũ không đổi;234giá trị có nguồn ở hồ sơ hiện tại. Server8772; xem [runbook](PATIENT-FIELDS-REVIEW.md). Word bindings vẫn63/261; đây là đủ cấu trúc trường, chưa phải trích đủ dữ liệu hoặc hoàn tất bài toán OCR261mục. Metadata/mẫu vẫn chưa có sửa giá trị trên UI; kiểm browser trực quan và import REDCap thật còn mở.

## Cập nhật 07/11 — thử inputs trên một bệnh nhân thật

Theo xác nhận IN01–IN12 cùng một bệnh nhân, đã tạo **LUPUS-000001** trong SQL chính:12tài liệu,175observations trên91mã,56metadata,3specimen entries. Liên kết/chấp nhận có provenance chỉ dẫn và backup; source_verified, không phải đánh giá lâm sàng. Không suy lần khám chung, Study ID hoặc ngày thiếu; dùng OCR revision5 đã duyệt, không inference mới. UI8771 có bảng tìm kiếm dữ liệu bệnh nhân và xuất toàn ca. CSV235dòng, một record_id; Word giữ175observations (53vào ô mẫu,122ở phụ lục), đã tự kiểm30trang. **202Python tests và JS controller smoke đạt**. Bản giao tại `outputs/patient-inputs-20261107-01/LUPUS-000001/`; chi tiết và verification trong SESSION-HANDOFF.md. Các mục0cases bên dưới là lịch sử.

Đã hoàn thành thử luồng từ dữ liệu nguồn đã duyệt đến hồ sơ bệnh nhân và file xuất. Chưa coi toàn bài toán hoàn tất: còn thử import trên REDCap Development thật, mở rộng safe bindings Word (hiện63/261mục), trích thuốc/lâm sàng và đánh giá OCR độc lập. Không dùng91/261 làm độ chính xác OCR hoặc độ đầy đủ bệnh án.

## Cập nhật 07/11 — xuất qua giao diện review

Đã nối exporter vào màn hình review: chọn ca/lần ghi nhận, xem trước phạm vi và lý do loại, tạo/tải CSV REDCap hoặc Word kèm snapshot/report. CSV giữ toàn bộ visits của ca, Word chỉ lấy visit đã chọn. Preview có hash và hết hạn, nguồn kiểm lại trước xuất; ledger đối soát riêng ca không báo nhầm dữ liệu ca khác bị mất. **196 Python tests và kiểm controller JavaScript đạt**; live HTTP demo tạo/tải CSV2visits/4kết quả và Word5kết quả thành công. Word16trang render trùng bản đã kiểm trước. Kiểm trực quan UI còn thiếu vì công cụ trình duyệt không kết nối; import REDCap thực tế và198bindings Word còn mở. Xem [hướng dẫn thao tác](REGISTRY-EXPORT-RUNBOOK.md#xuất-trực-tiếp-trên-màn-hình-review).

## Cập nhật 07/11 — exporter REDCap và Word dự thảo

Theo lựa chọn **tạo bộ biến mới từ Word**, đã thêm exporter SQL chỉ đọc, mapping đủ 261 mục/377 component, Data Dictionary gồm 5 form/70 biến dùng chung và 4 repeating instruments. Cặp field_id/component giữ danh mục nghiệp vụ; mỗi kết quả là một instance riêng, không flatten theo giá trị mới nhất. Ledger SQL riêng giữ instance ổn định và báo các dòng cần đối chiếu khi rút duyệt. Word chỉ điền ô đã kiểm nhãn/placeholder/hash (63/261 mục); phần chưa gắn ô được giữ ở phụ lục. Đây là tiến triển Mốc D, **chưa xác nhận tương thích trên project REDCap thực tế hoặc hoàn thiện toàn bộ ô Word**.

Pilot SQL giả lập: 3 ca, 4 lần khám, 9 kết quả được chấp nhận trong mô phỏng, 8 metadata đã duyệt nguồn; CSV 24 dòng. Word DEMO-002 điền 5 chỉ số, giữ 15 trang gốc và thêm 1 phụ lục; đã render/kiểm đủ trang, chỉ khác trang 1/6/9 và phụ lục. **188 tests đạt**, gồm 12 kiểm thử export mới. Kho thật giữ 234 phê duyệt nguồn, chưa có liên kết ca/lần khám nên chưa xuất thành bệnh nhân. Xem [runbook export](REGISTRY-EXPORT-RUNBOOK.md). Các phần tiến độ dưới giữ lịch sử.

## Yêu cầu hiện hành

Lưu output thành pool có đủ các trường nghiệp vụ của Word lupus. Hiện chưa cần sắp thứ tự hoặc dựng bố cục Word. Dữ liệu cần giữ được cấu trúc để sau này ánh xạ sang form như REDCap hoặc xuất Word; không dùng vị trí ô Word làm khóa dữ liệu. Mọi xử lý và dữ liệu vẫn nội bộ.

## Cập nhật tiến độ triển khai

Cập nhật phê duyệt nguồn 07/11: theo chỉ dẫn trực tiếp sau khi người dùng đã đối chiếu, đã ghi **175 observations +56 metadata +3 specimens của revision5 là đã duyệt nguồn**. Batch lưu nguyên văn xác nhận, snapshot/hash, người dùng là reviewer và Codex là recorder, không giả định tên hoặc vai trò bác sĩ. Có backend/UI duyệt/rút/loại/cần làm rõ cho cả3 nhóm, export `source-reviewed-pool-0.1` đủ261 mục và evidence/history; nhập lại request an toàn. Hai ngày thiếu và22 source placeholders giữ nguyên. Case/encounter/identity/clinical acceptance vẫn chưa được gán. **167 tests đạt**. Đây là tiến triển Mốc C và nền export cho Mốc D; sửa metadata/mẫu, mapping REDCap/Word và case-bound export đủ nhóm còn mở. Server đã cập nhật tại cổng8766. Chi tiết/receipt/export ở đầu `SESSION-HANDOFF.md`; các phần dưới giữ lịch sử.

Cập nhật runner form 07/11: đã nối 5 stage form vào runner whole-image (tổng 30 stage), có fingerprint code/schema form, skip model khi manifest rỗng và lưu riêng runtime/provenance retry trong bundle. CLI `scripts/run_specimen_pool.py` đã chạy thật 8 stage từ clinical final đã lưu, kiểm `--resume` không chạy lại inference và nhập lặp an toàn vào kho thử riêng. Kết quả giữ nguyên 175 observations/56 metadata, thêm 3 specimen candidates; lab/metadata/ADM 142/142, 46/46, 9/9; form 8/10, hai ngày null. Audit đạt, **153 tests đạt**. Chưa rerun toàn bộ runner 30 stage từ ảnh; dùng chung helper form/publish đã được thử. Server review đã mở lại cổng8766; kho chính vẫn revision5. Chi tiết và snapshot mới ở đầu `SESSION-HANDOFF.md`. Các cập nhật dưới là lịch sử.

Cập nhật sau phần form 07/11: kho chính có **revision 5**, exchange 1.1 có 3 specimen candidates/10 evidence links; candidate pool 0.3 và SQLite có bảng mẫu riêng. Lượng Stool đọc lại từ nguồn thành 01, form khớp **8/10**, hai ngày còn null. 175 observations, 56 metadata và field states clinical giữ nguyên revision 4; đánh giá lại lab/metadata/ADM và audit đạt. UI có phần xem specimen pending, chưa duyệt/link specimen/event hoặc xuất mẫu đã duyệt. **147 tests đạt**. Form extension còn chạy bằng CLI riêng, chưa gọi từ runner whole-image. Xem `OCR-FORM-RESULTS.md` và mốc đầu `SESSION-HANDOFF.md`.

Cập nhật mới nhất 07/11: `workflow-20261107-02` đã chạy đủ 25 bước từ ảnh gốc và kiểm resume không chạy lại model. Đánh giá riêng đạt 142/142 xét nghiệm, 46/46 metadata, 9/9 ADM và audit nguồn/SQLite. Đã nhập kho chính thành revision 4, nhập lặp không nhân đôi. Đây vẫn là trợ lý tự đánh giá trên cùng bộ phát triển, chưa human-verified/holdout. Lượt đầu mất 39 kết quả và các bản sửa vẫn giữ nguyên để truy vết. Tổng **132 tests đạt**.

Mốc C đã có bản thử `registry_review/`: case/encounter/identity/review/history append-only, kiểm kiểu dữ liệu và concurrency, không để OCR mới ghi đè quyết định cũ; HTTP UI tại localhost, crop/raw kiểm hash, chọn bản cần thay thế và xuất JSON accepted-only loại conflict. **Chưa coi Mốc C hoàn tất**: chưa metadata review/manual mapping, xử lý hết mâu thuẫn khác entity/tài liệu, specimen/form integration hoặc UI visual QA. Vai trò mới là khai báo, chưa authentication; chỉ dùng một máy. Kho thật vẫn 0 ca/0 quyết định duyệt. Xem `POOL-REVIEW-RUNBOOK.md`.

Mốc sidecar IN12 trước mở rộng khớp 7/10; revision 5 hiện đã tích hợp và khớp 8/10, còn hai ngày. Mốc A còn semantic/component review, Mốc B còn hoàn thiện form/thuốc/lâm sàng, Mốc D và đánh giá độc lập còn mở. Xem `SESSION-HANDOFF.md` phần mới nhất và `OCR-FORM-RESULTS.md`. Các đoạn tiến độ dưới đây giữ bối cảnh lịch sử, không thay thế mốc mới này.

Mốc A đã có nền dictionary/schema dự thảo và importer cục bộ chạy trên dữ liệu thật: 261 field, 377 component; bundle có source/raw/crop/hash; nhập lặp an toàn, revision/supersedes, nguồn bất biến và audit hash chain. Đã nhập hai revision ứng viên vào `research/registry-pool/registry-20261106-01.sqlite`. Chưa coi Mốc A hoàn tất: còn rà ngữ nghĩa từng component, tăng kiểm tra semantic validator, liên kết case/encounter có xác nhận và truy vấn theo những liên kết đó.

Phần sửa lỗi OCR hiện hữu của Mốc B đã có bản ghép được kiểm tra: `run-20261106-auto-corrections-04` khớp 142/142 tuple xét nghiệm, 46/46 metadata và 9/9 ADM trong scope phát triển. ANA/SID đã được lấy từ retry nguồn, chú thích UPCR không còn là result, nhãn ngày sinh rỗng được thay bằng nhóm dòng metadata hoàn chỉnh. Chỉ 174 observations cũ không đổi và một REN01 chú thích được thay bằng IMM01 thật. Đây là trợ lý tự đánh giá, chưa được người phụ trách xác nhận. Form/checkbox, thuốc và lâm sàng vẫn chưa hoàn tất.

Đã có runner từ ảnh gốc tới bundle với stage manifest, hash, khóa chống chạy đồng thời, thử lại hữu hạn và resume không chạy lại stage đã xác minh. `workflow-20261106-01` đang chạy kiểm tra từ đầu trên 12 ảnh; kết quả chưa được gán điểm trước khi hoàn tất. Mốc C/D và đánh giá độc lập còn mở.

## Trạng thái đã kiểm tra

Nguồn: `schemas/crf-template-fields.json`, `ocr_pool/pipeline.py`, `scripts/export_pool_sqlite.py` và `research/ocr-pool/run-20261106-auto-legend-01/`.

- Có **261 mã danh mục**, tất cả đã hiện diện trong `pool.fields`.
- Có quy tắc trích cho **98 mã**: 94 mã trong rules và 4 ADM. **163 mã chưa có parser**. Có quy tắc không có nghĩa mọi dạng nguồn của mã đó đều đã xử lý được.
- Bộ ảnh thử có quan sát ở **90 mã**, tổng 175 observations, 57 metadata. **171 mã đang not_processed**; gồm các mã chưa triển khai và các mã chưa được lấy ra trong phạm vi đang xử lý. Đây không phải phép đo độ đầy đủ dữ liệu bệnh nhân hay độ chính xác OCR.
- Có JSON, SQLite theo từng gói/lượt và HTML để xem nguồn. SQLite hiện là bản export ứng viên mới mỗi lượt, có ràng buộc chỉ nhận pending; **chưa phải importer/kho vận hành cho nhiều hồ sơ**.
- IDs observations/evidence hiện có phạm vi từng lượt; chưa có package revision, stable identity, ingestion lặp an toàn, giao dịch duyệt hoặc audit lịch sử người sửa.
- Danh mục có **11 mục ghi nhận slot lặp** và nhiều kiểu ghép như CAT + TEXT, FINDING + TEXT, LAB có pattern/grade. 261 mã chưa phải số biến nguyên tử cuối cùng.
- Hai nhóm EULAR/ACR và SLEDAI có **47 mã assessment** chưa triển khai. Chỉ trích đánh giá được ghi trực tiếp; không tự suy điểm/tiêu chí từ dấu hiệu để lấp trường.

## 1. Hoàn thiện từ điển dữ liệu có phiên bản

Rà từng mục Word thành trường và component nguyên tử: tên ổn định, định nghĩa, kiểu số/ngày/chuỗi/lựa chọn, mã lựa chọn, đơn vị, phương pháp/panel/loại mẫu, điều kiện áp dụng, bằng chứng cần có, nhóm lặp và vai trò thời gian. Giữ liên kết từ mọi component về field_id và vị trí nguồn trong Word.

Ví dụ ANA giữ kết quả, pattern, grade/hiệu giá và phương pháp nếu nguồn có. Thuốc giữ tên, liều, đơn vị liều, tần suất, đường dùng và khoảng thời gian nếu được ghi. Không tự thêm giá trị cho component không có trên nguồn. Phân biệt lựa chọn Yes/No/Unknown với chưa trích hoặc chưa đọc được.

Đồng bộ trạng thái của catalog với schema thực tế: catalog hiện chưa liệt kê not_processed dù pipeline dùng trạng thái này. Dùng validator máy cho kiểu dữ liệu, lựa chọn, ID, quan hệ và enum; không chỉ kiểm số lượng keys.

Đầu ra: dictionary có phiên bản + JSON Schema + bảng bao phủ, theo từng field/component, ghi rõ đã hỗ trợ nguồn nào và còn thiếu gì. Đây là cơ sở để kiểm đủ trường mà không tạo giá trị giả.

## 2. Kho nhận dữ liệu và định danh

Phát triển importer nội bộ vào SQLite cho bản đầu, có thể chuyển PostgreSQL khi cần nhiều người dùng. Mô hình giữ riêng: subject/case, encounter/event, document/page, processing run/package, observation, evidence, review decision và audit event.

- Cấp package_id, revision và IDs ổn định; ID nguồn của từng lượt được giữ làm lineage.
- Nhập lại cùng package/revision không tạo thêm dữ liệu; cùng ID/revision có nội dung khác phải báo lỗi. Lượt OCR mới có liên kết supersedes, không ghi đè nguồn hoặc bản duyệt cũ.
- Xác nhận tài liệu thuộc ca/người trước khi liên kết. PID/SID, mã registry và Study ID có vai trò riêng. Không tự dùng PID làm Study ID, không tự gộp người chỉ vì mã hoặc tên giống nhau.
- Manifest nguồn và hash phải dùng đường dẫn/khóa file nội bộ có thể di chuyển. Việc chống trùng ảnh và chống trùng quan sát là hai kiểm tra riêng.
- Tạo dữ liệu hiệu lực bằng lựa chọn quan sát có lịch sử; giữ những lần đo khác ngày, khác mẫu hoặc cùng ngày khác lần làm.

Đầu ra: importer có transaction và kiểm thử nhập lặp, quản lý phiên bản/nguồn và truy vấn pool theo ca/lần ghi nhận.

## 3. Mở rộng trích xuất ngoài bảng xét nghiệm

Ưu tiên xử lý phần còn thiếu theo loại nguồn:

1. Sửa các lỗi hiện hữu IN10 (ANA thiếu, UPCR chú thích thừa) và IN01 (SID bị cắt, label ngày sinh rỗng).
2. Metadata thu mẫu/form IN12 và checkbox: giá trị được đánh dấu, không đánh dấu, không đọc được phải có quy tắc riêng; checkbox trống không tự thành No.
3. Thuốc/điều trị: danh sách thuốc và nhiều đợt sử dụng.
4. Dấu hiệu lâm sàng, bệnh đồng mắc, tiền sử và báo cáo chuyên khoa: nhận đúng phủ định, thời điểm và ai là người có dấu hiệu; giữ câu nguồn khi chưa map chắc.
5. EULAR/ACR và SLEDAI: lấy thông tin đánh giá đã ghi; trường cần bác sĩ đánh giá giữ requires_clinical_assessment, giá trị chưa tính giữ not_computed.

Chỉ dùng model/rule đã đo trên ví dụ phù hợp; không lấy điểm khớp xét nghiệm hiện tại làm bằng chứng cho chất lượng thuốc, checkbox hoặc văn bản lâm sàng. Cần thêm hồ sơ/loại tài liệu có chứa các trường này để đo khả năng thu dữ liệu.

## 4. Tình trạng thiếu, mâu thuẫn và đối chiếu

Mỗi field/component phải có quan sát hoặc trạng thái kèm phạm vi nguồn đã tìm. Tách not_processed, processing_failed, not_found trong phạm vi đã xử lý, unreadable, ambiguous_mapping, conflict, not_applicable, requires_clinical_assessment và not_computed. Chưa có dữ liệu không tự thành No, âm tính hoặc 0.

Giữ raw và giá trị chuẩn hóa tách biệt; có quy tắc riêng cho đổi đơn vị và có nguồn cho mọi phép diễn giải. Nhiều kết quả khác ngày là quan sát khác nhau. Mâu thuẫn cùng mốc/mẫu cần được gắn cờ, không tự chọn giá trị cuối.

Bổ sung UI duyệt có thao tác lưu: người duyệt chọn/sửa/loại, thời điểm, lý do, trước/sau và evidence. Review HTML hiện tại chủ yếu để xem. Điểm do trợ lý/model tự chấm không tự nâng output thành verified. Tách ứng viên khỏi dữ liệu được chấp nhận; bản đã duyệt là nguồn xuất mặc định, còn xuất pending phải ghi rõ trạng thái.

## 5. Lớp ánh xạ REDCap và Word

Pool giữ mô hình dữ liệu theo khái niệm và quan sát, độc lập thứ tự hiển thị. Tạo hai mapping có phiên bản:

- REDCap: field/component → tên biến, kiểu, mã lựa chọn, form, event, nhóm lặp/instance và quy tắc thiếu. Một kết quả lab có thể xuất thành nhiều biến số–đơn vị–dấu–ngày–phương pháp. Một phiếu có thể tạo nhiều bản ghi lặp.
- Word: field/component → vị trí hiển thị và quy tắc chọn lần đo/mốc khám. Đổi thứ tự/bố cục chỉ cần đổi mapping/template; dữ liệu nguồn vẫn giữ nguyên.

Khi có nhiều quan sát, phải cấu hình mốc và tiêu chí xuất: ví dụ một lần khám đã chọn hoặc một mẫu xét nghiệm đã xác nhận. Không mặc định flatten bằng “lấy mới nhất” và làm mất lịch sử. Thử round-trip trên dữ liệu giả; đối chiếu data dictionary của project REDCap thực tế trước khi tuyên bố file import tương thích. Chưa cần kết nối hay tải hồ sơ lên REDCap ở giai đoạn này.

## Thứ tự triển khai đề xuất

**Mốc A:** dictionary/schema component + báo cáo bao phủ đủ 261 mục + importer idempotent vào kho nội bộ; sử dụng ngay raw và pool hiện có, không chạy lại OCR không cần thiết.

**Mốc B:** sửa lỗi còn lại và thêm trích form/checkbox, thuốc, lâm sàng; từng nhóm có dữ liệu thử và bằng chứng đánh giá riêng.

**Mốc C:** màn hình duyệt có ghi lịch sử, quản lý nhiều lần khám/mẫu và xử lý mâu thuẫn.

**Mốc D:** mapping/export dữ liệu thử sang REDCap, rồi dựng Word theo mẫu. Các artifact xuất chỉ là góc nhìn của pool theo mốc đã chọn.

## Điều kiện hoàn thành pool bản đầu

- Mọi mục/component trong dictionary có giá trị có nguồn hoặc trạng thái thiếu/chưa xử lý đúng nghĩa.
- Nhập lặp không nhân đôi; OCR lại không làm mất bản cũ; tài liệu chưa xác nhận người không bị tự gộp.
- Dữ liệu lặp giữ được các lần đo, mẫu và thời điểm; kết quả có thể truy ngược tới nguồn.
- Có thể duyệt/sửa và tái dựng lịch sử; mọi phép diễn giải có phương pháp và lineage.
- Dựng được bảng xuất cho ca/lần khám đã chọn theo mapping, không cần đọc lại Word hoặc chạy lại OCR.
- Độ đúng và độ bao phủ được đo riêng trên hồ sơ mới được rà độc lập; tự đánh giá hiện tại giữ nguyên nhãn chưa được người phụ trách xác nhận.
