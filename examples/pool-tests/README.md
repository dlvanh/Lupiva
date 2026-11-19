# Bảng thử nhỏ cho bước OCR → pool

`input.json` là **dữ liệu giả**, được tạo có chủ đích để thử parser; không phải output do model đọc từ ảnh. Một số giá trị minh họa trùng số thường gặp, không đại diện cho bệnh nhân. Không dùng kết quả thử này để báo độ chính xác OCR.

| Bảng | Ca thử | Kết quả cần có |
| --- | --- | --- |
| BIO | Đổi thứ tự cột, dấu phẩy thập phân, dấu `<` | C3 → IMM11, 0.65 g/L; RF giữ `<10`; không lấy khoảng tham chiếu làm kết quả. |
| CBC | RBC, HGB, NE#, NE%, PLT | Đúng mã HEM; NE# và NE% cùng khái niệm nhưng giữ hai component và đơn vị. |
| ANA | dsDNA, Ku, Scl-70 | Đúng mã ANA; giữ intensity/class; không gán dsDNA panel thành IMM04 ImmunoCAP. |
| MYO | Ku, HMGCR, OJ | Ku → MYO06; HMGCR → MYO16; OJ giữ trong danh sách chưa ánh xạ vì Word hiện không có trường tương ứng. |
| PFT | Header HTML hai tầng, Pre/Post, Meas./%Pred | FVC → PFT02 với 4 quan sát có component riêng; không nhận giá trị Pred 4.0 thành số đo. |
| ERRORS | `4.O`, thiếu panel, output chạm giới hạn token | Không sửa O thành 0; Ku thiếu panel phải giữ mơ hồ; không nhận bảng bị cắt vào pool. |

Chạy từ gốc workspace, không cần GPU hoặc thư viện ngoài:

```powershell
py -m unittest discover -s tests -v
py scripts/convert_ocr_tables.py examples/pool-tests/input.json --output examples/pool-tests/output.json
```

`output.json` là **pool ứng viên**, có đầy đủ 261 mục danh mục Word với trạng thái. Chưa trích được nhóm nào thì giữ `not_processed`; không tự tạo kết luận bệnh, điểm số hay dữ liệu thiếu. Mọi quan sát có bằng chứng hàng/cột và `review_status=pending`, chưa đủ điều kiện vào pool đã xác minh. `not_found` chỉ áp dụng cho phạm vi bảng đã xử lý; nếu có bảng lỗi hoặc hàng chưa ánh xạ, các trường vắng được giữ `not_processed` hoặc `ambiguous_mapping`.

`images/` có bốn ảnh bảng giả (BIO, CBC, ANA, MYO) để thử recognition, được tạo bởi `scripts/render_synthetic_tables.py`; `regions.json` khai báo vùng bảng và ngữ cảnh. Ví dụ chạy model offline khi đã tải đủ trọng số:

```powershell
.\.venv-senocr\Scripts\python.exe scripts/recognize_regions.py --manifest examples/pool-tests/regions.json --output research/ocr-pool/run-synthetic-images
```

Input JSON trong bộ thử không được đưa vào prompt để làm gợi ý đáp án. Lượt này model chỉ nhìn ảnh và prompt tác vụ `Table Recognition:`; parser nhận ngữ cảnh panel/loại mẫu và legend đã có trên mẫu. Đây vẫn là ảnh giả rõ nét, chưa đại diện ảnh chụp hồ sơ thật.
