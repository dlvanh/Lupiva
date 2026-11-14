# Chạy thử OCR bảng → pool lupus

## Quy tắc ngày, nhãn mẫu và OCR header

Phiếu xét nghiệm ưu tiên `sample_date`; khi không có candidate ngày lấy mẫu, có thể dùng `measurement_date` hợp lệ với đúng loại ngày và evidence cùng tài liệu. Candidate ngày lấy mẫu lỗi/mâu thuẫn chặn fallback. PFT vẫn dùng `measurement_date`. Ngày sinh, nhận mẫu và chỉ định không thay cho ngày lấy mẫu/ngày đo; ô ngày thu mẫu trong form không tự lấy ngày từ header.

Nhãn `Other:`/`Others:` và `Other(s), specify:` được ánh xạ tường minh sang mẫu `other`, giữ nguyên chữ nguồn và checkbox. Thiếu dấu checkbox vẫn là `unreadable`, không suy thành bỏ chọn hay clinical No.

Header retry chọn bảng kết quả trước bảng chú giải và chỉ chạy trên dải có text do detector phát hiện. Một số mẫu câu model tự giới thiệu thay vì OCR bị đánh dấu `ocr_self_referential_response`, giữ raw/crop, đưa vào `issues` và loại khỏi nguồn metadata/panel context. Đây là bộ phát hiện mẫu lỗi cụ thể, không bảo đảm bắt được mọi đoạn OCR bịa hoặc mọi giá trị sai. Header thay thế phải có metadata hợp lệ và giữ đủ các key hợp lệ của header cũ.

## Runner có xử lý phiếu thu mẫu — 07/11/2026

Runner whole-image hiện dùng 30 stage: 22 stage clinical cũ, 5 stage form và 3 stage xuất SQLite/review/bundle. Sau clinical assembly, hệ thống tìm ô mẫu còn thiếu từ đường kẻ nguồn, đọc lại tối đa hai lượt (ô đầy đủ rồi vùng mực xanh), tích hợp specimen vào pool 0.3 và xuất exchange 1.1. Mỗi lượt OCR form giới hạn 512 token; lỗi geometry được giữ trong manifest. Manifest rỗng bỏ qua OCR, không nạp model. Clinical observations và metadata giữ nguyên; specimen vẫn pending, chưa xác nhận ca/lần thu mẫu.

Để xử lý form từ một run clinical đã lưu, không cần OCR lại xét nghiệm:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/run_specimen_pool.py --run CLINICAL-RUN --output NEW-SPECIMEN-WORKFLOW --db NEW-VALIDATION.sqlite
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/run_specimen_pool.py --run CLINICAL-RUN --output NEW-SPECIMEN-WORKFLOW --db NEW-VALIDATION.sqlite --resume
```

`--db` tùy chọn. Giữ cùng tham số khi resume. Output phải nằm ngoài thư mục clinical cha và dùng đường dẫn mới. Configuration đóng băng toàn bộ artifact cha, hash ảnh nguồn, code (gồm `form_pool`), schema, model và tham số; không ép vượt kiểm tra nếu hash thay đổi. Những workflow cũ vẫn giữ nguyên, code mới không tự tiếp tục chúng. `--max-attempts` mặc định 2, tối đa 3, mỗi lần thử dùng thư mục riêng; process còn sống không bị chạy trùng.

Trong run tích hợp, `specimen-retries/` giữ bản sao `run.json`, `measurements.json`, `ocr-tables.json` của từng lượt form cùng hash trong provenance. Bundle mang theo và kiểm các artifact này; measurements clinical vẫn riêng, không coi thời gian chạy extension là latency OCR toàn hồ sơ. Reference chỉ dùng khi đánh giá sau chạy; runner không nhận reference hay quyết định người duyệt.

**Mốc mới nhất 07/11:** workflow-20261107-02 đã hoàn tất từ ảnh gốc, chấm riêng 142/142 tuple xét nghiệm, 46/46 metadata, 9/9 ADM; đây là tự đánh giá trên tập phát triển. Kho chính có revision 4 và **132 tests đạt**. Xem `OCR-LAYOUT-RESULTS.md` phần mới nhất và `POOL-REVIEW-RUNBOOK.md` để duyệt tại máy. Những chỉ số/lệnh 06/11 bên dưới mô tả các lượt cũ. Resume workflow-02 đã kiểm thành công trước khi sửa evaluator/render; hash code hiện thay đổi nên không ép resume vượt kiểm tra, không rerun inference chỉ để xem báo cáo.

**Cập nhật mới nhất 06/11/2026:** layout tự động đã chạy trên 12 ảnh; xem [kết quả và giới hạn layout](OCR-LAYOUT-RESULTS.md) và mục “Bổ sung layout tự động” cuối tài liệu. Hiện có 66 kiểm thử đạt. Kết quả mới nhất là `run-20261106-auto-legend-01`, sau xử lý legend có bằng chứng nguồn (141/142 tuple khớp, vẫn pending); `auto-eval-final-04` là mốc trước sửa legend. Luồng metadata/crop thủ công trước đó được mô tả tại [kết quả metadata](OCR-METADATA-RESULTS.md). Các ví dụ hai vùng ở dưới là các bước thử ban đầu.

## Ghép metadata với bảng từ raw đã lưu

Không cần GPU hay mạng để ghép lại. Dùng thư mục output mới; các manifests dưới đây chứa đường dẫn hồ sơ cục bộ và được gitignore.

```powershell
.\.venv-senocr\Scripts\python.exe -m unittest discover -s tests
.\.venv-senocr\Scripts\python.exe scripts/merge_ocr_runs.py --manifest examples/metadata-merged-development.json --selection examples/metadata-run-selection.json --run research/ocr-pool/run-20261105-final-01 --run research/ocr-pool/run-20261105-metadata-01 --run research/ocr-pool/run-20261106-metadata-retry-01 --output research/ocr-pool/run-new-integrated
.\.venv-senocr\Scripts\python.exe scripts/compare_pool_fields.py research/ocr-pool/run-new-integrated/candidate-pool.json examples/ocr-reference-draft/development-field-reference.json --output research/ocr-pool/run-new-integrated/field-comparison.json
.\.venv-senocr\Scripts\python.exe scripts/compare_pool_metadata.py research/ocr-pool/run-new-integrated/candidate-pool.json examples/ocr-reference-draft/development-metadata-reference.json --output research/ocr-pool/run-new-integrated/metadata-comparison.json
.\.venv-senocr\Scripts\python.exe scripts/compare_pool_fields.py research/ocr-pool/run-new-integrated/candidate-pool.json examples/ocr-reference-draft/development-adm-reference.json --output research/ocr-pool/run-new-integrated/adm-comparison.json
.\.venv-senocr\Scripts\python.exe scripts/export_pool_sqlite.py research/ocr-pool/run-new-integrated/candidate-pool.json --output research/ocr-pool/run-new-integrated/candidate-pool.sqlite
.\.venv-senocr\Scripts\python.exe scripts/render_pool_review.py research/ocr-pool/run-new-integrated
```

`text_regions` sử dụng tác vụ `text`, prompt `OCR:`, `purpose=metadata`. `metadata_context.date_order=DMY` phải dựa vào nguồn; timestamp PFT không nhãn dùng `unlabelled_datetime_role=measurement_date` sau khi rà bố cục. Các khóa `metadata_exclude_keys` chỉ dùng khi vùng nguồn thay thế đã được chọn rõ, raw cũ vẫn giữ để đối chiếu. `scripts/prepare_metadata_reference.py` dựng lại tham chiếu từ các bản chép độc lập, không nhận file predictions.

**Đã chạy model offline sau khi tải đủ checkpoint.** Kết quả, VRAM/latency, JSON/SQLite và giới hạn mới nhất nằm trong [OCR-POOL-RESULTS.md](OCR-POOL-RESULTS.md). Lượt cuối khớp 142/142 tuple với bản tham chiếu nháp trên 8 ảnh. Chưa có layout tự động hoặc benchmark được người phụ trách xác minh.

Đây là bản triển khai thử có thể chạy; chưa có bằng chứng đạt chất lượng OCR trên toàn bộ hồ sơ. Các bản ghi xuất ra là ứng viên chờ đối chiếu. Chưa dùng LLM bổ sung.

## Thành phần đã có

- `ocr_pool/tables.py`: nhận HTML có rowspan/colspan, TSV và Markdown; từ chối văn bản không có cấu trúc bảng, bảng sai số cột hoặc bị cắt. Không ghép cột bằng khoảng trắng.
- `ocr_pool/rules.py`: bộ alias nháp theo mã thực trong danh mục Word. Tách ANA Profile, myositis, ImmunoCAP, máu/nước tiểu; không tự tạo trường cho kháng nguyên không thuộc Word.
- `ocr_pool/pipeline.py`: phân vai cột, trích/chuẩn hóa bằng Decimal, giữ dấu so sánh và bằng chứng hàng/cột. Không đổi đơn vị vật lý, tự sửa chữ O thành số 0, suy tiêu chí lupus hoặc tính điểm bệnh.
- `scripts/convert_ocr_tables.py`: chuyển output bảng có cấu trúc sang pool ứng viên mà không cần GPU.
- `scripts/recognize_regions.py`: nhận dạng các vùng ảnh đã khai báo bằng SenOCR-Vi chạy cục bộ, giữ raw output, crop, latency và VRAM; đưa qua parser. Chỉ nạp model đã tải đủ, đặt offline và không upload dữ liệu.
- `examples/pool-tests/`: sáu bảng nhỏ bằng dữ liệu giả để kiểm thử. Các kiểm thử này không phải benchmark chất lượng OCR.

Pool vẫn liệt kê toàn bộ 261 mục danh mục Word với trạng thái và liên kết quan sát, không giả vờ mọi mục đã có bộ trích. Số 261 là mục danh mục, không phải số biến nguyên tử đã hoàn thiện.

## Cài và tải model

Chạy trong PowerShell có mạng nếu sandbox Codex không được mở mạng:

```powershell
cd C:\Users\ADMIN\LUPUS-REGISTRY
.\scripts\setup_senocr_local.ps1
```

Script dùng môi trường `.venv-senocr` đã có CUDA, giữ PyTorch hiện tại và khóa phiên bản Transformers/Accelerate theo notebook Kaggle trước đó. Model được tải ở revision cụ thể; `models/SenOCR-Vi/download-manifest.json` lưu revision và checksum. Không cần checkpoint do chính phiên Kaggle cũ tạo ra. Cài thư viện không đồng nghĩa trọng số đã tải đủ.

## Thử parser độc lập

```powershell
py -m unittest discover -s tests -v
py scripts/convert_ocr_tables.py examples/pool-tests/input.json --output examples/pool-tests/output.json
```

Input cho CLI là JSON có `documents`, mỗi tài liệu có `document_id`, `context` và `tables`. Mỗi bảng có `raw`, `format` tùy chọn, `header_rows` tùy chọn, `truncated` và `generation_status` nếu có. Header phải xác định được tên chỉ số và kết quả/intensity/số đo; cột tham chiếu không được dùng thay kết quả.

`context` có thể nêu `panel`, `specimen`, quy ước thập phân, ngày/loại ngày và legend nếu hiện trên nguồn. Mọi thông tin này phải có nguồn; không đoán từ trị số. Quy ước dấu phẩy thập phân cần khai báo rõ để không nhầm phân cách hàng nghìn. `source_date` lưu đúng loại ngày, không tự thay ngày lấy mẫu bằng ngày trả kết quả.

## Thử OCR thật với GPU 4 GB

Hai vùng đầu trong `examples/region-development.json` được đánh dấu trực tiếp trên ảnh phát triển: bảng sinh hóa IN01 và bảng ANA IN09. File manifest chứa tên nguồn nội bộ nên nằm trong `.gitignore`. Các vùng chỉ cung cấp tọa độ/ngữ cảnh, không cung cấp giá trị đáp án cho model.

```powershell
.\.venv-senocr\Scripts\python.exe scripts/recognize_regions.py --manifest examples/region-development.json --region-id IN09-ana --output research/ocr-pool/run-first-ana
```

Sau khi kiểm tra raw output và bảng trung gian:

```powershell
.\.venv-senocr\Scripts\python.exe scripts/recognize_regions.py --manifest examples/region-development.json --output research/ocr-pool/run-two-tables
```

Runner mặc định FP16, batch 1, SDPA, cache bật, ngân sách ảnh 1.003.520 pixel và tối đa 2048 token. Đây là cấu hình để đo, chưa được xác nhận tối ưu trên RTX 2050. Chọn thư mục output mới mỗi lần; không ghi đè kết quả trước. Kết quả chạm giới hạn token hoặc OOM không được coi là bảng hoàn chỉnh. Chưa tự retry hoặc đổi cấu hình ngầm; thay đổi phải được ghi nhận ở lượt chạy tiếp theo.

Các output gồm `run.json`, `measurements.json`, `raw/`, `crops/`, `ocr-tables.json` và `candidate-pool.json`. Bộ nhớ báo theo MiB của PyTorch allocator; không đồng nhất với tổng VRAM thiết bị. Latency vùng có cả tiền xử lý và sinh output, không phải tốc độ toàn bộ pipeline tự động.

## Điều kiện trước khi kết luận đủ tốt

Đã chuẩn bị 34 tuple tham chiếu nháp (11 sinh hóa, 23 ANA) từ các bản chép độc lập trong `examples/ocr-reference-draft/development-field-reference.json`. `scripts/prepare_development_reference.py` tạo gói này mà không đọc dự đoán OCR. Chỉ khi có output OCR thật mới chạy phép đối chiếu:

```powershell
py scripts/compare_pool_fields.py research/ocr-pool/run-two-tables/candidate-pool.json examples/ocr-reference-draft/development-field-reference.json --output research/ocr-pool/run-two-tables/field-comparison.json
```

Phép so sánh đếm tuple trùng đúng, thiếu, thừa/sai và bản lặp; không thưởng cho hàng trăm trường rỗng. Kết quả luôn ghi `provisional=true` khi đáp án chưa được người phụ trách rà. Không được trình bày phép so sánh với bản nháp này thành độ chính xác đã xác nhận trên toàn bộ hồ sơ.

1. Model phải thực sự chạy trên ảnh, không thay bằng bản chép tham chiếu hoặc dữ liệu giả.
2. Đối chiếu chính xác các tuple tên trường–kết quả–dấu–đơn vị–panel–component trên các vùng đã chọn. Không dùng các trường trống để làm tăng điểm. Bộ đáp án hiện là bản nháp do trợ lý chép, cần rà trước khi làm benchmark đã xác nhận.
3. Không có giá trị không có nguồn hoặc nhầm cột được tự nhận vào pool đã xác minh. Mọi giá trị nháp giữ trạng thái pending và link bằng chứng; kiểm cấu trúc không chứng minh chữ/số OCR đúng.
4. Mở rộng đủ nhóm: sinh hóa, huyết học, nước tiểu, panel ANA/myositis, PFT và thông tin định danh/ngày; các nhóm bệnh sử/thuốc/checkbox không được âm thầm coi là đã hỗ trợ.
5. Cần tích hợp layout tự động và kiểm tra trên mẫu/bố cục mới; các tọa độ phát triển không phải layout tổng quát. Mẫu từ cùng hồ sơ không được coi là holdout độc lập.
6. Đo latency/VRAM thực tế và tỷ lệ cần đối chiếu. Chỉ sau các vòng điều chỉnh crop/độ phân giải/ngân sách token/parser mới cân nhắc LLM nội bộ cho những lỗi trích nghĩa còn lại; LLM không thay được bằng chứng đọc đúng hàng/cột.

Thiếu trọng số/mạng chỉ chặn thử model. Nó không chứng minh model kém hoặc cần thêm LLM. Chưa đánh dấu hoàn tất mục tiêu tối ưu nếu chưa có các bằng chứng trên.
# Bổ sung layout tự động — 06/11/2026

## Lệnh tích hợp mới và lưu pool có phiên bản

Cập nhật 07/11: workflow đầu đã chạy xong và thử resume thành công nhưng bị lỗi chất lượng chọn grid (103/142). Code hiện đã sửa và có 99 tests; bản dựng lại từ raw mới là `run-20261107-workflow-repaired-01` đạt 142/142, 46/46 metadata, 9/9 ADM. Kiểm tra chạy từ đầu lần hai đang ở `workflow-20261107-02`; không dùng điểm bản ghép thay điểm của workflow mới. Các câu mô tả trạng thái workflow-01 “đang chạy” phía dưới thuộc lần cập nhật trước. Khi code đổi, resume workflow cũ sẽ báo hash khác; dùng output mới, không bỏ kiểm tra hash.

`scripts/run_automatic_pool.py` nhận manifest **chỉ gồm document_id và input_path**; không nhận tọa độ hoặc reference. Manifest ví dụ là `examples/automatic-source-images.json` (12 ảnh phát triển, không phải hồ sơ mới).

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/run_automatic_pool.py --manifest examples/automatic-source-images.json --output research/ocr-pool/NEW-workflow --db research/registry-pool/NEW-registry.sqlite
```

Runner lần lượt chạy detector, routing, OCR, grid/lab retry, metadata, identifier bands, row/detail retry, ghép pool, export SQLite, HTML và bundle. Vùng không áp dụng được ghi skipped; không tự chạy OCR trên manifest rỗng. Mỗi stage tối đa hai lần thử mặc định (có thể chọn 1–3); mỗi lần có thư mục mới, stdout/stderr cục bộ. Per-region lỗi/token cap vẫn giữ rõ trong raw/issues và measurements, không tự tăng số lần đọc vô hạn. Các ngưỡng/biến thể crop là giới hạn cố định của workflow, không chọn dựa trên điểm reference.

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/run_automatic_pool.py --manifest examples/automatic-source-images.json --output research/ocr-pool/NEW-workflow --db research/registry-pool/NEW-registry.sqlite --resume
```

Resume cần cùng tham số, hash nguồn/code/model và mọi artifact của stage hoàn tất. Khóa OS ngăn hai runner trên cùng workflow; stage child còn sống không được khởi động lại. Nếu trạng thái launch chưa đủ chắc để chứng minh child đã dừng, runner báo lỗi để kiểm tra. Không xóa folder cũ để vượt giới hạn thử. `workflow.json` ghi trạng thái/thời gian, command/PID/creation identity của child, hash artifact và thư mục output cuối.

Runner không tự chấm điểm hoặc xác nhận dữ liệu. Kiểm tra từ đầu trên 12 ảnh đang ở `research/ocr-pool/workflow-20261106-01/`; theo dõi trạng thái thật trong manifest và process, không xem file lock là chứng cứ process còn sống.

Bản ghép hiện đã chấm riêng là `research/ocr-pool/run-20261106-auto-corrections-04/`: 142/142 xét nghiệm, 46/46 metadata, 9/9 ADM. Nhãn: **trợ lý tự đánh giá, chưa được người phụ trách xác nhận**. Reference chỉ dùng ở bước đánh giá sau trích xuất.

Dictionary hiện ở `schemas/pool-dictionary.json`, schema ở `schemas/pool-package.schema.json`, coverage ở `schemas/field-coverage.json` (coverage của run legend lịch sử). 261 mã và 377 component vẫn là dự thảo cần rà nghiệp vụ; parser mới hỗ trợ 98 mã. Validator chuẩn thư viện kiểm tra tập con JSON Schema dùng trong dự án và các liên kết, không phải JSON Schema engine tổng quát.

Đóng gói một run đã có và nhập kho:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/manage_pool.py bundle --run research/ocr-pool/NEW-assembled --output research/ocr-pool/NEW-bundle
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/manage_pool.py import --bundle research/ocr-pool/NEW-bundle --db research/registry-pool/NEW-registry.sqlite
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/manage_pool.py inspect --db research/registry-pool/NEW-registry.sqlite
```

Cùng package/revision và cùng nội dung trả `already_imported`; nội dung khác báo lỗi. Revision mới cần `--package-id`, `--revision`, `--supersedes-package`, `--supersedes-revision` ở lệnh bundle, không ghi đè package cũ. Byte hash bảo vệ file nguyên bản; evidence hash raw text dùng cùng chuẩn newline của parser, nên CRLF Windows không bị coi là thay đổi chữ. Tài liệu vẫn chưa gắn ca/người tự động.

Các lệnh thủ công và mốc điểm ở phần dưới được giữ làm lịch sử; chọn tên output mới khi dùng lại.

Kết quả mới nhất là `research/ocr-pool/run-20261106-auto-legend-01/`; chi tiết điểm và giới hạn trong `OCR-LAYOUT-RESULTS.md`. Các lệnh ghép raw dưới đây dùng được với rules 0.4 để tái tạo kết quả mới, chọn output mới. `auto-eval-final-04` là mốc trước sửa legend. Các phần hướng dẫn lịch sử ở đầu tài liệu vẫn áp dụng cho luồng crop thủ công, không đại diện cho mức tự động hóa mới.

Inference dùng `.venv-senocr\Scripts\python.exe -X utf8`. Luôn dùng output mới, giữ raw/crop cũ. Không truyền reference vào detector, crop hoặc runner. Để chạy trên ảnh mới, thực hiện các lệnh sau với tên thư mục mới:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/detect_layout.py --input-dir examples/inputs --output research/ocr-pool/NEW-layout
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/prepare_layout_regions.py research/ocr-pool/NEW-layout/layout.json --output examples/layout-NEW-initial.json
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/recognize_regions.py --manifest examples/layout-NEW-initial.json --output research/ocr-pool/NEW-ocr
```

Tinh chỉnh từ geometry và raw đã lưu, không dùng tọa độ của bộ phát triển:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/refine_layout_regions.py research/ocr-pool/NEW-layout/layout.json --ocr-run research/ocr-pool/NEW-ocr --output examples/layout-NEW-grid.json
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/prepare_layout_metadata_lines.py --layout research/ocr-pool/NEW-layout/layout.json --ocr-run research/ocr-pool/NEW-ocr --output examples/layout-NEW-metadata-lines.json
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/prepare_layout_headers.py --layout research/ocr-pool/NEW-layout/layout.json --ocr-run research/ocr-pool/NEW-ocr --output examples/layout-NEW-headers.json
```

`refine_layout_regions.py` chỉ hỗ trợ panel được nhận diện từ tiêu đề tường minh và grid đủ chắc; xem `refinement_failures`. `prepare_layout_retry.py` có thể thu hẹp grid lab bị lỗi và bỏ dải tiêu đề PFT theo đường kẻ; không sửa span/raw lỗi. Dải header rộng vẫn có thể lặp hoặc đọc sai dấu thời gian; từng dòng detector thường tốt hơn trên tập hiện tại. Chạy `recognize_regions.py` với manifest cần đọc; manifest rỗng thì bỏ qua, không có silent fallback. Với nhiều nguồn OCR, có thể lặp `--ocr-run` ở hai script metadata.

Ghép theo thứ tự cha trước con. Ví dụ tái tạo pool hiện tại từ **raw đã lưu**, không cần load GPU:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/assemble_automatic_pool.py --layout research/ocr-pool/run-20261106-layout-01/layout.json --run research/ocr-pool/run-20261106-auto-baseline-01 --run research/ocr-pool/run-20261106-auto-other-01 --run research/ocr-pool/run-20261106-auto-grid-02 --run research/ocr-pool/run-20261106-auto-headers-01 --run research/ocr-pool/run-20261106-auto-headers-02 --run research/ocr-pool/run-20261106-auto-metadata-lines-01 --date-order DMY --output research/ocr-pool/NEW-assembled
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/export_pool_sqlite.py research/ocr-pool/NEW-assembled/candidate-pool.json --output research/ocr-pool/NEW-assembled/candidate-pool.sqlite
```

`auto-grid-01` là lượt thử cũ, không thêm vào selection trên vì trùng region ID với grid-02. Vẫn phải tính chi phí lượt thử này trong đánh giá hiệu năng. Bảng cha bị thay vẫn được giữ để đọc metadata và audit; không tạo lại quan sát lâm sàng trùng. Mỗi child cần một parent tường minh và cùng hash ảnh/layout. Metadata replacement bị từ chối nếu generation chưa hoàn tất hoặc làm mất một loại thông tin đang hợp lệ; xem `metadata_replacement_decisions` trong provenance.

Đánh giá phát triển và audit, sau khi export SQLite:

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/evaluate_automatic_pool.py research/ocr-pool/NEW-assembled --attempt-run research/ocr-pool/run-20261106-auto-baseline-01 --attempt-run research/ocr-pool/run-20261106-auto-other-01 --attempt-run research/ocr-pool/run-20261106-auto-grid-01 --attempt-run research/ocr-pool/run-20261106-auto-grid-02 --attempt-run research/ocr-pool/run-20261106-auto-headers-01 --attempt-run research/ocr-pool/run-20261106-auto-headers-02 --attempt-run research/ocr-pool/run-20261106-auto-metadata-lines-01
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/render_pool_review.py research/ocr-pool/NEW-assembled
.\.venv-senocr\Scripts\python.exe -X utf8 -m unittest discover -s tests
```

Script đánh giá hiện dùng reference draft hiện có và kiểm bảo toàn integrated-02 theo snapshot cũ. Chỉ dùng trên tập phát triển phù hợp; ảnh mới cần reference mới được rà độc lập, không gán lại IDs của reference cũ để lấy điểm. Chạy render sau đánh giá để HTML hiện nhãn **“trợ lý tự đánh giá, chưa được người phụ trách xác nhận”**. Mọi dữ liệu vẫn pending/unconfirmed; không tự chuyển sang verified.

---
