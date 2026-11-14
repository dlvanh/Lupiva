# Đề xuất cắt và che ảnh tại máy

UI dùng OCR tại máy để đề xuất cắt và che cho luồng API. Khi người dùng tạo hồ sơ, hệ thống dùng trực tiếp vùng cắt tự động đủ điều kiện. Ảnh còn cảnh báo cần người dùng kiểm tra vùng gửi hoặc đánh dấu bỏ qua.

## Hai công việc khác nhau

OCR local đọc ảnh gốc và giữ chữ cùng tọa độ tại máy. Phần thông tin cần cho CRF hoặc liên kết hồ sơ được giữ cục bộ để đối chiếu. Bộ đề xuất tạo một bản ảnh khác, cắt/che định danh để người dùng kiểm tra trước khi gửi Gemini. Che được thông tin không có nghĩa là đã OCR đúng thông tin đó.

Sidecar `dates_local` giữ chữ nhận được, vị trí và trạng thái cần duyệt. Luồng API dùng OCR gốc và hash của ảnh để gắn ngày lấy mẫu hoặc ngày đo có nhãn rõ, kèm ảnh nguồn riêng để đối chiếu. Ngày mơ hồ và năm hai chữ số giữ trạng thái cần xem lại.

## Module

- `ocr_pool/privacy_proposal.py`: quy tắc thuần local từ chữ và tọa độ; crop theo nhóm nhãn đầu bảng, mask định danh và ngày có ngữ cảnh. Không dùng tên bệnh nhân đã biết, mã ảnh, tọa độ template hoặc đáp án xét nghiệm.
- Đầu bảng xét nghiệm có thể xuống dòng. Ghép các mảnh nhãn cùng cột theo vị trí và yêu cầu cột kết quả cùng ít nhất hai cột lân cận. Đề xuất vẫn giữ đến cuối trang để bảo toàn các bảng và ghi chú phía dưới. Kiểm tra phần chân phiếu trước khi gửi API.
- Với đầu bảng bị lệch theo góc chụp, có thể che tên nhân viên hoặc ngày giờ ngay phía trên cột liên quan khi nhãn và vị trí khớp. Nếu vùng cần che chồng vào tiêu đề cột, ảnh vẫn cần đối chiếu.
- `ocr_pool/privacy_geometry.py`: tìm đường kẻ từ pixel và kiểm tra barcode/QR, không OCR. Chỉ cần quét khung cột khi có các nhãn bảng thu mẫu phù hợp.
- `tests/test_privacy_proposal.py`: giá trị/bố cục mới, ảnh bảng và QR giả lập; kiểm tra giữ dữ liệu lân cận và loại metadata.

Đầu vào dùng hệ tọa độ pixel của ảnh **đã chuẩn hướng EXIF**:

```python
from ocr_pool.privacy_proposal import propose, render, collection_headers
from ocr_pool.privacy_geometry import inspect_barcodes, vertical_segments

# image là ảnh local đã chuẩn hướng; lines là kết quả OCR đã lưu.
# Mỗi line: line_id, text, box=[x0,y0,x1,y1], confidence (tùy chọn).
codes = inspect_barcodes(image)
grid = vertical_segments(image) if collection_headers(lines) else []
plan = propose(lines, codes, image.size, vertical_segments=grid)
preview = render(image, plan)
preview.save('preview-unreviewed.png')
```

Không đưa một bbox trần thành bằng chứng barcode đã xác nhận. `decoded=true` và `valid=true` của ZXing được giữ cùng format và hash payload; nội dung giải mã không được in ra. Mã giải mã thất bại chỉ thành mục kiểm tra, không tự che vùng rộng. Phát hiện OpenCV cũng không tự được nâng thành mã đã giải mã.

## Ngày và cột thời gian

- Kiểm tra ngày lịch hợp lệ, dấu phân cách thống nhất và biên ký tự. Không nhận một phần khoảng số thập phân thành ngày.
- Tự che ngày khi có ngữ cảnh nhãn thời gian; trường tham chiếu được bảo vệ. Ngày đứng riêng hoặc chung OCR line với nội dung khác được đánh dấu kiểm tra thay vì che mất nội dung lân cận.
- Hỗ trợ ngày viết bằng chữ tiếng Việt và biến thể nhãn năm `nm`; không sửa chữ số OCR.
- Với cột thời gian thu mẫu, cần nhãn cột, các nhãn bảng lân cận và hai đường kẻ đủ rõ. Che phần thân cột bằng polygon theo độ nghiêng, không dựa vào tọa độ cố định. Thiếu khung hoặc khung đi xuyên hàng gộp thì yêu cầu người kiểm tra.
- Không dừng mask theo mép trên bbox chữ hàng kế tiếp: bbox OCR có thể chồng lên đuôi ngày ở hàng trước. Dùng giới hạn đường kẻ để tránh sót phần chữ dưới mask.

`render` thay pixel bằng màu trắng trên canvas RGB mới, không mang EXIF/comment/ICC từ ảnh gốc. Đề xuất cục bộ luôn có `reviewed=false` và `outbound_allowed=false`. Server chỉ tạo kế hoạch tự động khi có tiêu đề bảng, vùng cắt bỏ được phần đầu ảnh và không còn mục cần kiểm tra. Kế hoạch được ràng buộc với hash và hình học của ảnh.

## Tên và chữ ký nhân viên

- Che trường có nhãn vai trò như **Người lấy mẫu**, **Người nhận mẫu**, **Người chỉ định** hoặc **Bác sĩ**, khi tên nằm cùng trường hoặc ô ngay bên cạnh và vùng che không chạm dòng OCR khác trong ảnh gửi.
- Che khối ký chân phiếu khi có nhãn/chức danh phù hợp với bố cục PFT hoặc panel, dấu mực xanh ở vùng ký và đủ khoảng cách với kết quả hoặc bảng chú giải. Các quyết định dùng chữ và hình học của từng ảnh.
- Với khối ký PFT có một ô chữ riêng cùng dòng, có thể thu mép che tới ranh giới giữa hai ô nếu mép mới vẫn phủ khối ký và không bỏ lại nét mực xanh.
- Tên hoặc vùng ký có dấu hiệu nhưng chưa tách được khỏi nội dung khác hiện mục **cần kiểm tra** và chặn kế hoạch gửi tự động. Trình duyệt nhận số mục cần kiểm tra và hình học, còn chữ OCR đầy đủ ở máy.

## Cài môi trường thử riêng

Dependencies tùy chọn ở `requirements-privacy.txt`. Giữ riêng với môi trường SenOCR/GPU. Môi trường thử hiện có `.venv-privacy-trial`; các model đã tải nằm trong thư mục research của lượt benchmark đầu tiên.

Trên Ubuntu Server thiếu `libGL.so.1`, cài OpenCV headless cùng phiên bản trong môi trường OCR. RapidOCR khai báo phụ thuộc `opencv-python`, nên thực hiện bước thay thế sau khi cài `requirements-privacy.txt`. Hai bản OpenCV dùng chung module `cv2` và chỉ nên giữ một bản trong môi trường này.

```bash
.venv-privacy-trial/bin/python -m pip uninstall -y opencv-python
.venv-privacy-trial/bin/python -m pip install --no-deps opencv-python-headless==5.0.0.93
.venv-privacy-trial/bin/python -c 'import cv2, rapidocr, onnxruntime, zxingcpp'
```

```powershell
.\.venv-privacy-trial\Scripts\python.exe -X utf8 -m unittest discover -s tests -p test_privacy_proposal.py -v
```

Không tải model hoặc gọi OCR chỉ để replay các quy tắc này. Runner đã kiểm chứng: `research/privacy-local-fix-20261110-01/replay.py`; kết quả hoàn chỉnh ở `attempt-6/`. Runner giữ mỗi lượt riêng và chặn network.

## Giới hạn hiện tại

Nhận diện nhân viên dựa trên nhãn vai trò hoặc dấu hiệu của khối ký tách biệt. Tên/chữ ký không có các dấu hiệu này, hoặc không được OCR nhận ra, vẫn có thể bị bỏ sót. Ngày ngoài phạm vi rõ của bảng được giữ làm thông tin nguồn chờ đối chiếu.
