# Kế hoạch 6 tuần: OCR và tạo pool dữ liệu lupus

Cập nhật 05/11/2026 theo xác nhận lại của người dùng. Word đã lọc ngoài lupus là tài liệu xác định bộ trường nghiệp vụ. Đầu ra của phần OCR là pool dữ liệu để hệ thống lưu trữ tiếp nhận và có thể xuất Word sau. Xem [đặc tả hiện hành](./OCR-TO-CRF-SPEC.md) và [hợp đồng pool](./OCR-DATA-POOL-CONTRACT.md).

Hạ tầng đã xác nhận: server nội bộ có GPU NVIDIA, tạm hiểu VRAM 4–8 GB, xử lý hồ sơ hoàn toàn nội bộ. Dùng [model OCR chạy local](./OCR-TECHNICAL-PROPOSAL.md); không dùng dịch vụ OCR/AI cloud.

Tuần 1–2 áp dụng [danh sách model đã nghiên cứu](./OCR-MODEL-RESEARCH.md): PaddleOCR-VL-1.6, MonkeyOCRv2-B-Parsing, SenOCR-Vi trên vùng cần thiết và PP-OCRv5 làm mốc. Model vận hành được chọn sau benchmark local và đo VRAM thực tế.

## Đích đến

Tải bộ ảnh/PDF hồ sơ → OCR → trích/chuẩn hóa theo bộ trường nghiệp vụ → đối chiếu → xuất gói pool JSON có nguồn và phiên bản → kiểm nhập vào hệ thống lưu trữ. Thu mọi dữ liệu có bằng chứng; phần thiếu hoặc khó đọc có trạng thái rõ. Bộ xuất Word là thành phần của hệ thống phía sau.

Tuần tính từ ngày khởi động có người phát triển và người rà soát; đây là kế hoạch, chưa phải công việc đã triển khai. Hệ thống lưu trữ đầy đủ, xuất Word, dashboard và tích hợp bệnh viện chuyển sang đợt sau. Trong 6 tuần cần bàn giao dữ liệu độc lập với mẫu trình bày và kiểm chứng hợp đồng nhập.

## Công việc và đầu ra từng tuần

| Tuần | Công việc cụ thể | Đầu ra để review | Điều kiện qua mốc |
| --- | --- | --- | --- |
| **1 — Chốt schema pool, dựng OCR local** | Kiểm GPU/VRAM/driver; dựng baseline và môi trường thử parser. Chuyển các trường Word thành từ điển: mã, kiểu, thuộc tính con, lựa chọn, nhóm lặp, đơn vị. Đối chiếu nhãn từ 12 input; xác nhận định danh. | Schema/từ điển nháp, gói JSON mẫu có nguồn, môi trường OCR local. | Mọi nội dung cần thu theo Word được biểu diễn trong schema; mục chưa rõ ghi riêng; chạy được OCR mẫu. |
| **2 — Đo và chốt model local** | Benchmark danh sách ưu tiên trên cùng nhãn; đo chữ, bảng, checkbox, viết tay, số, liên kết hàng/cột, thời gian và VRAM. Kiểm khi chặn Internet. | OCR thô và đầu ra có cấu trúc, bảng lỗi, checkpoint/cấu hình, ngưỡng chất lượng. | Chạy lại offline; xác định loại phiếu đọc được/chưa được; chọn theo độ đúng dữ liệu. |
| **3 — Trích xét nghiệm và PFT** | Tách số/dấu/đơn vị/ngày/panel, giữ % và số tuyệt đối; phân loại vào trường nghiệp vụ. Giữ quan sát khác ngày, chống trùng quan sát cùng phiếu. | Pipeline ảnh → quan sát có nguồn → pool theo danh mục; ứng viên và lỗi riêng. | Không lẫn panel, phương pháp, cột tham chiếu; không ghi đè lịch sử. |
| **4 — Hoàn thiện pool và hợp đồng nhập** | Các nhóm hành chính, bệnh sử, thuốc, cơ quan, checkbox, điểm ghi trực tiếp. Hoàn thiện trạng thái thiếu/lỗi/mâu thuẫn, ID, phiên bản, manifest và kiểm schema. | Gói pool đầu tiên bao phủ toàn bộ bộ trường; hướng dẫn import và ví dụ dữ liệu giả. | Đủ trường/thuộc tính/nhóm lặp; nhập thử local không mất thông tin và không nhân bản khi nhập lại. |
| **5 — Đối chiếu và sửa lỗi** | Màn hình tối thiểu ảnh cạnh dữ liệu; lưu sửa và bản gốc; xử lý lại không ghi đè bản đã duyệt. Kiểm pool với bên xây hệ thống lưu trữ nếu có. | Bản thử từ tải ảnh đến pool, lịch sử sửa, độ đúng/tỷ lệ tìm đủ theo nhóm. | Mọi giá trị có nguồn; lỗi quan trọng chặn để kiểm tra; bàn giao không phụ thuộc vị trí ô Word. |
| **6 — Nghiệm thu và bàn giao** | Thử ca chưa dùng tinh chỉnh khi có; kiểm đầy đủ schema, trạng thái, import lặp, quyền, chặn egress và khôi phục backup. | Pool JSON + schema/từ điển/manifest; cấu hình model; báo cáo chất lượng/giới hạn; hướng dẫn vận hành và tích hợp. | Đạt đặc tả pool và kiểm soát nội bộ; không suy chất lượng mọi bệnh viện từ bộ phát triển. |

## Các mốc kiểm tra

- **Cuối tuần 1:** xác định schema nghiệp vụ từ Word và thông tin nào có thể trích từ input.
- **Cuối tuần 2:** có kết quả engine thật và cơ sở chốt công cụ/ngưỡng chất lượng.
- **Cuối tuần 4:** có gói pool đầu tiên và kiểm nhập theo hợp đồng dữ liệu.
- **Cuối tuần 6:** có bản chạy thử, kết quả nghiệm thu và giới hạn đã đo.

Xét nghiệm được triển khai trước vì bộ input hiện có nhiều phiếu xét nghiệm. Thứ tự này không giảm bộ trường: toàn bộ nội dung nghiệp vụ của Word là phạm vi kiểm kê schema và xử lý trạng thái từ tuần 1.

## Phân công đề xuất

| Vai trò | Trách nhiệm |
| --- | --- |
| Người phát triển | OCR, schema pool, phân loại/chuẩn hóa, màn hình đối chiếu và gói bàn giao. |
| Người phụ trách mẫu/bác sĩ | Xác nhận nghĩa trường, alias, lựa chọn, dòng lặp; rà nhãn chuẩn và câu hỏi chuyên môn. |
| Người kiểm tra dữ liệu | Đối chiếu giá trị với input, kiểm đủ trường/thuộc tính và quan sát, ghi lỗi có nguồn. Có thể kiêm nhiệm nếu đủ thời gian. |
| Bên xây hệ thống lưu trữ | Tiếp nhận hợp đồng pool; xây cơ sở dữ liệu và bộ xuất Word ở giai đoạn phía sau. |

Nếu chỉ có một người phát triển, giữ giao diện ở mức tải file, tiến độ, xem/sửa dữ liệu và tải gói pool; dành thời gian cho độ đúng OCR và hợp đồng dữ liệu. Không đưa toàn bộ hệ thống registry vào cùng mốc.

## Trạng thái hiện tại

Đã có danh mục 261 mục, kiểm kê 20 bảng Word, manifest ảnh và [bản đọc trực quan minh họa](./examples/derived/CRF-EXAMPLE-001.md). Đây là tài liệu khởi đầu tuần 1; chưa phải schema pool nguyên tử hoàn chỉnh và chưa được kiểm chứng độc lập.

Chưa chạy engine OCR, chưa triển khai pipeline tự động/pool vận hành và chưa đo độ chính xác. Các mốc tuần 2–6 là công việc dự kiến. Xuất Word thuộc hệ thống lưu trữ phía sau.
