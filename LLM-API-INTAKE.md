# Đọc ảnh qua API khi thêm hồ sơ

Trong **Thêm hồ sơ từ ảnh → Cách đọc ảnh**, chọn **OCR tại máy**, **AI qua API** hoặc **Token Harbor · DeepSeek V4.1 Flash**. OCR tại máy là mặc định. Mỗi lượt gửi giữ cố định phương thức đã chọn.

## Prototype gửi ảnh gốc (chỉ dữ liệu giả lập)

`LUPIVA_PROTOTYPE_DIRECT_LLM=1` bật chế độ demo cho ảnh giả lập khi chọn một phương thức API.
Biến môi trường được ưu tiên; nếu không có, đọc từ `.env` trong thư mục dự án. Chỉ giá trị `1` bật chế độ; mặc định tắt.
UI hiển thị banner đỏ. Toàn bộ ảnh sau khi chỉnh hướng EXIF được gửi, không cắt bỏ nội dung, không che vùng và không chạy OCR tại máy.
Ảnh vẫn qua bước xuất JPEG hiện có để bỏ EXIF. Không dùng ảnh bệnh nhân thật.

LLM đọc kết quả, ngày lấy mẫu/ngày trả kết quả/ngày đo và các trường đầu trang: giới tính, tuổi, chiều cao, cân nặng, Physician/người chỉ định, Nurse/người lấy mẫu.
Các giá trị và bằng chứng được giữ dưới dạng ứng viên chờ duyệt, gồm các trường ADM02/03/05/06/08/09; không tự duyệt.
Ngày lấy mẫu (hoặc ngày đo cho PFT) được ưu tiên; ngày trả kết quả chỉ thay thế khi không có ngày ưu tiên, không thay thế ngày mơ hồ hoặc mâu thuẫn.
Payload `GET /api/intakes` cung cấp `prototype_direct_llm` chỉ để hiển thị. Khi tắt, prompt/schema và luồng OCR thông thường giữ nguyên.

## Token Harbor · DeepSeek V4.1 Flash

Điền API key trong `.env` ở thư mục dự án. Có thể sửa URL và model ID theo tài khoản.

```dotenv
TOKENHARBOR_BASE_URL=https://tokenharbor.ai/v1
TOKENHARBOR_MODEL=deepseek-v4.1-flash:free
TOKENHARBOR_API_KEY=
TOKENHARBOR_FALLBACK_API_KEYS=
```

`TOKENHARBOR_FALLBACK_API_KEYS` là danh sách key dự phòng cách nhau bằng dấu phẩy. Với model `:free`, khi API báo rõ đã hết hạn mức miễn phí, Lupiva thử lại cùng yêu cầu với key kế tiếp và bỏ qua key đã hết hạn mức trong lượt xử lý đó. Lỗi giới hạn tốc độ có `Retry-After` được trả về như bình thường.

Model mặc định hỗ trợ ảnh. Luồng Token Harbor dùng Chat Completions với JSON mode và kiểm tra đầu ra theo cùng schema trích xuất. Chọn **Token Harbor · DeepSeek V4.1 Flash** để xử lý hồ sơ mới. Với manifest vùng gửi đã xác minh, CLI dùng `scripts/run_llm_pool.py --engine tokenharbor --manifest MANIFEST --output OUTPUT`. [Thông tin model](https://tokenharbor.ai/models/deepseek-v4.1-flash:free)

### Thử đọc nhanh phiếu hô hấp ký

Thêm `--fast-pft` vào lệnh CLI hoặc đặt `TOKENHARBOR_FAST_PFT=1` trong `.env` để dùng tùy chọn này khi đọc ảnh từ giao diện. Chế độ thử áp dụng cho `deepseek-v4.1-flash:free` khi OCR cục bộ nhận ra bảng hô hấp ký trong vùng gửi. API trả từng hàng in với các ô Pre/Post cùng hàng và Lupiva tra mã CRF tại máy. Nếu chưa đủ căn cứ nhận diện, có bảng khác cùng vùng, hoặc phản hồi nhanh thiếu hàng, cột phần trăm hoặc trường mà OCR cục bộ đã xác định, runner dùng luồng API thông thường. Dữ liệu vẫn chờ đối chiếu và duyệt.

### Thử đọc nhanh bảng xét nghiệm

`--fast-labs` hoặc `TOKENHARBOR_FAST_LABS=1` bật thử schema ngắn cho bảng sinh hóa, công thức máu và panel ANA/Myositis đủ căn cứ nhận diện. Hồ sơ có nhiều loại bảng, ANA huỳnh quang hoặc tiêu đề chưa nhận diện được đi qua luồng thường. Các dòng Control/Label được loại khi nằm trong panel có hai cột Intensity và Class đã xác định. Luồng nhanh giữ ký hiệu Class nguyên văn và kiểm tra các mã đã nhận diện từ OCR cục bộ trước khi lưu. Khi phản hồi nhanh bị từ chối, lần gọi bằng luồng thường có giới hạn 32.000 token đầu ra và lưu lý do chuyển luồng.

## Dùng trên giao diện

1. Chọn **AI qua API**, rồi chọn các ảnh của cùng một bệnh nhân. Máy đề xuất vùng cắt và che cho từng ảnh.
2. Xác nhận bộ ảnh cùng một bệnh nhân, rồi bấm **Tạo hồ sơ và xử lý ảnh**. Khi tất cả ảnh đã có vùng cắt đủ điều kiện gửi, đã được kiểm tra hoặc được đánh dấu bỏ qua, hệ thống tự tiếp tục gửi để xử lý nền.
3. Với ảnh hiện **Cần kiểm tra**, mở **Xem vùng cắt đề xuất**, chỉnh vùng kết quả hoặc dùng **Che thêm** rồi xác nhận bản xem trước. Có thể chọn **Không gửi ảnh này** để giữ ảnh gốc trong hồ sơ mà bỏ qua trích xuất ảnh đó.
4. Kết quả chạy nền xuất hiện trong các phần thuộc CRF, ngoài CRF, thông tin trên phiếu/thu mẫu để duyệt.

Lượt gửi bị gián đoạn sẽ dùng lại cùng hồ sơ, nguồn, phương thức và vùng gửi đã xác nhận. Giao diện yêu cầu chọn lại bộ ảnh đầy đủ theo thứ tự ban đầu; vùng cắt/che được khôi phục bằng hash ảnh. Lỗi API giữ nguyên ảnh và cho phép chạy lại; không tự chuyển sang OCR tại máy.

Ảnh TIFF có thể không xem trước được trên trình duyệt. Khi đó cần chuyển sang PNG/JPEG để chọn vùng cho Gemini. UI này nhận ảnh đơn trang, chưa thêm chức năng upload PDF trực tiếp.

## Cấu hình tại máy chủ

Đọc từ `.env` ở thư mục dự án, không gửi khóa xuống trình duyệt:

```dotenv
GEMINI_API_KEY=your-key
GEMINI_MODEL=your-model-id
GEMINI_BASE_URL=http://localhost:8317
```

Gateway tương thích dùng `/v1/chat/completions`; Gemini REST chính thức dùng `https://generativelanguage.googleapis.com/v1beta`. Hỗ trợ HTTPS hoặc HTTP loopback cho gateway tại máy. Không chấp nhận URL chứa credentials, query/fragment hay HTTP từ xa; không chuyển tiếp khóa qua redirect. Trạng thái cấu hình trên UI chỉ chứa availability và tên model.

### Chạy thử trên Ubuntu 24.04

Chép mã dự án hiện tại lên Ubuntu. Đặt ba model OCR cục bộ trong `models/privacy/`: `ch_PP-OCRv5_det_mobile.onnx`, `ch_ppocr_mobile_v2.0_cls_mobile.onnx` và `latin_PP-OCRv5_rec_mobile.onnx`. Tạo `.env` trên Ubuntu với cấu hình API ở trên và giới hạn quyền đọc bằng `chmod 600 .env`.

Trong thư mục dự án trên Ubuntu, tạo môi trường Python và một cơ sở dữ liệu trống dành riêng cho pilot.

```bash
sudo apt-get update
sudo apt-get install -y python3-venv libgl1 libglib2.0-0t64 libgomp1
python3 -m venv .venv-privacy-trial
.venv-privacy-trial/bin/python -m pip install -r requirements-privacy.txt
.venv-privacy-trial/bin/python -c 'from registry_pool.store import Registry; Registry("pilot.sqlite").close()'
.venv-privacy-trial/bin/python -m registry_review.server --db pilot.sqlite --synthetic --port 8873
```

Từ máy cá nhân, mở đường hầm SSH trong cửa sổ terminal riêng. Thay `user@ubuntu-host` bằng tài khoản và địa chỉ Ubuntu.

```bash
ssh -N -L 127.0.0.1:8873:127.0.0.1:8873 user@ubuntu-host
```

Mở [giao diện thử](http://127.0.0.1:8873/) và dùng một ảnh giả lập để kiểm tra vùng cắt/che, ảnh sẽ gửi và kết quả chờ duyệt. OCR cắt/che chạy bằng CPU. Nếu Ubuntu chạy trên VPS, ảnh gốc được tải lên VPS trước bước cắt/che. Endpoint API nhận ảnh đã cắt/che. Dùng cấu hình loopback qua SSH cho pilot nội bộ vì giao diện hiện chưa có đăng nhập riêng.

### Chấm điểm trên phiếu CRF

Mở **Phiếu CRF → Chấm điểm EULAR/ACR 2019 và SLEDAI-2K**. Xác nhận điều kiện ANA cho EULAR/ACR và nhập ngày đánh giá cho SLEDAI-2K. Chọn **Tính điểm nháp** để xem gợi ý có dữ kiện từ C3/C4 hoặc protein niệu 24 giờ. Có thể dùng **Điền các mục có đề xuất**, rồi kiểm tra ảnh nguồn, xác nhận hoặc sửa từng tiêu chí và tính lại. Các mục chưa đánh giá để trống.

EULAR/ACR lấy điểm cao nhất mỗi nhóm sau khi xác nhận ANA và chỉ ghi tổng khi các nhóm đã đủ dữ kiện để tính. SLEDAI-2K cộng điểm sau khi xác nhận ngày và đủ 24 mục trong cửa sổ 10 ngày. **Duyệt phiếu CRF** lưu lựa chọn và tổng điểm. Khi chạy server với `--export-template` trỏ tới đúng mẫu Lupiva, bản Word điền tổng vào hai dòng tương ứng, tích ô EULAR/ACR và đánh dấu tiêu chí SLEDAI-2K trong bảng.

## Giới hạn dữ liệu gửi

Máy chủ kiểm tra hash ảnh, vùng cắt/che và xác nhận trước khi xếp hàng; tiến trình xử lý kiểm tra lại toàn bộ bộ ảnh trước request đầu tiên. Chỉ gửi JPEG kết quả đã cắt/che, không EXIF, cùng prompt/dictionary. Không gửi ảnh gốc, tên file gốc hoặc metadata hành chính của lượt upload. Các bản gốc vẫn được lưu tại máy và liên kết với hồ sơ để đối chiếu.

Vùng cắt tự động cần có cấu trúc kết quả nhận diện được và hết cảnh báo trên ảnh gửi. Có thể mở bản xem trước để đối chiếu hoặc chỉnh vùng trước khi tạo hồ sơ. Mọi thông tin còn trong vùng xem trước có thể được gửi tới endpoint đã cấu hình.

## Kết quả và kiểm tra

- Dùng cùng dictionary 261 mục/377 thành phần. Giữ cả kết quả ngoài CRF, ghi chú và thông tin thu mẫu; những loại mẫu ngoài hợp đồng sẵn có được giữ dạng thông tin nguồn cần duyệt.
- Lưu JSON API nguyên bản, bản chuẩn hóa, audit, model/usage và ảnh đối chiếu cắt/che. Nguồn bằng chứng ghi rõ Gemini API; bảng được tạo từ JSON để hiển thị không được ghi là OCR tại máy.
- Dữ liệu luôn pending, không tự duyệt hoặc ghi vào pool đã xác nhận. Lần gửi mới không ghi đè hồ sơ cũ.
- Giá trị số, comparator, component và chú thích grade được kiểm tra bằng quy tắc dùng chung. Sai sót nhận diện vẫn cần người duyệt; điểm ưu tiên không phải xác suất đúng.
- Bộ chuẩn hóa dùng quy tắc có phiên bản trong `schemas/result-literals.sql` để điền kiểu định tính còn thiếu từ chữ in trong ô Kết quả. Mỗi lần bổ sung lưu lại quy tắc đã dùng cùng bằng chứng. CLI có thể chỉ định bộ quy tắc SQLite khác bằng `--result-rules`.
- Trước bước gọi API, OCR tại máy đọc ngày trên ảnh gốc. Lượt xử lý dùng lại bản OCR từ đề xuất cắt nếu hash ảnh và hash OCR khớp. Với vùng chọn tay, máy có thể đọc lại ảnh gốc. Ngày lấy mẫu ở đầu phiếu gắn vào xét nghiệm cùng ảnh khi xác định được phạm vi. Hô hấp ký dùng ngày đo có nhãn rõ. Khi mở **Xem / sửa**, chọn ảnh bằng chứng **Thông tin nguồn · OCR tại máy** để kiểm ngày.
- Nếu nhãn Kco/Tlco/DLCO thiếu bằng chứng hiệu chỉnh Hb, giá trị được giữ ở phần ngoài CRF để đối chiếu. Khi LLM trả trùng một hộp cho nhiều hàng, UI bỏ khung đó và hiện lý do cần kiểm tra.

### Chạy lại bộ ảnh đã được xem trước

Lệnh dưới đây đọc ảnh gốc để lấy ngày tại máy, dựng lại JPEG cắt/che theo manifest và ghi bundle vào một thư mục mới. Dùng `expected_outgoing_sha256` trong manifest để kiểm khớp ảnh gửi đã duyệt trước mỗi lượt. Tham số `--model` chọn model cho lượt chạy đó.

```powershell
.\.venv-senocr\Scripts\python.exe -X utf8 scripts/run_llm_pool.py --manifest research/llm-crf-local-date-validation-20261111-01/lupus-000001-reviewed-replay.json --output research/lupus-000001-replay-new --model gpt-5.6-terra
```

Kiểm tra `candidate-pool.json`, ảnh ở `crops/` và phản hồi trong `api-responses/`. Bundle của lệnh này dùng để đối chiếu riêng trước khi đưa kết quả vào hồ sơ đang sử dụng. Với hồ sơ mới, dùng luồng thêm ảnh trên UI để kiểm cả bước đề xuất cắt/che.

```powershell
python -X utf8 -m unittest discover -s tests -p test_llm_intake.py -v
python -X utf8 -m unittest discover -s tests -p test_patient_intake.py -v
python -X utf8 -m unittest discover -s tests -p test_intake_server.py -v
node tests/review_intake_ui_smoke.cjs
```
