# Bổ sung dữ liệu có nguồn — 08/11/2026

Cập nhật 10/11: parser `lupus-table-rules-0.7` dùng cùng helper bỏ dấu checkmark ở rìa **nhãn để so khớp** trong nhận diện ngữ cảnh CBC và ánh xạ tên; giữ nguyên raw, ô kết quả, H/L và +/−. Vẫn cần ít nhất4nhãn khác nhau gồmRBC/WBC, đơn vị phù hợp và phạm vi cùng bảng, có guard urine/mixed-section. Không dùng giá trị số để nhận diện CBC. Kiểm tra trên raw OCR mới12inputs khôi phục16dòng/11mãCRF: CBC23/23, tổng166/167 (cònYellow),91/91mã có nguồn; BN3 giữ mọi kết quả cũ. 157Python tests đạt. Tệp kiểm chứng `research/cbc-annotation-fix-20261110-01/REPORT.md`. Lần này không importDB hoặc thay quyết định duyệt; metadataPID/SID và ngày viết tay vẫn là công việc riêng.

Cập nhật 09/11: `scripts/build_source_supplement.py --mapping-field ...` có chế độ bổ sung các component trước đó chưa có, chỉ từ OCR cache đã kiểm hash, không chép tay hay chạy model lại. Đã áp dụng cho UPCR và ANA của BN-CEDF9FAAC410: 3 ứng viên pending trong gói `pkg-7334b94a3add3c7985378da1329f5a2a`, revision 2, `research/BN1-mapping-fix-20261109-01/bundle-v2`. Gói chỉ thêm REN01 result và IMM01 result/method; giữ toàn bộ kết quả, phê duyệt và 17 xét nghiệm ngoài CRF hiện có. Revision 1 là lịch sử trước khi sửa ngữ cảnh bảng hỗn hợp. Chỉ dẫn bên dưới là mốc hồ sơ cũ, không phải kết quả chấm BN-1 hiện hành.

Mở **http://127.0.0.1:8773**, chọn **LUPUS-000001**, lọc **Có dữ liệu cần duyệt / làm rõ**. Phần **Dữ liệu bổ sung, thông tin nguồn và phiếu thu mẫu** mở sẵn khi có ứng viên mới. Có thể chọn nhiều giá trị hoặc chọn mọi giá trị trong bộ lọc, đối chiếu crop rồi lưu một đợt duyệt.

Đã nhập **66 ứng viên chờ duyệt** vào SQL hiện tại, giữ nguyên 175 kết quả đã duyệt và các quyết định nguồn trước đó:

| Nhóm | Số ứng viên mới | Nội dung |
|---|---:|---|
| Trường Word | 9 | 7 nguồn người chỉ định cho ADM08; IMM01.method; LUNG05.detail |
| Kết quả ngoài danh mục Word | 35 | 14 dòng hô hấp, 4 dòng NXP2/OJ trên hai tài liệu, 10 dòng nước tiểu, 7 dòng công thức máu |
| Thông tin nguồn | 22 | Chẩn đoán, người chỉ định, người lấy mẫu của 7 phiếu; một kết luận hô hấp |

Một dữ kiện có thể có cả ứng viên Word và thông tin nguồn. Đây không phải số thông tin lâm sàng độc lập. Tổng workspace: **261 mục / 377 thành phần; 93 mục có ứng viên; 184 observations, 113 metadata, 3 specimen entries**.

## Căn cứ và giới hạn

- Người chỉ định là đề xuất ánh xạ vào Physician, có cảnh báo cần xác nhận vai trò. Người lấy mẫu không tự thành Nurse. Chẩn đoán trên phiếu giữ mức độ nghi ngờ; không tự thành bệnh xác định hoặc điểm lâm sàng.
- ANA chỉ bổ sung phương pháp in rõ; không tạo titre từ 3+ hoặc suy phương pháp từ tên máy.
- OCR phần hô hấp viết tay sai chữ và bỏ dòng thứ hai ở cả hai lần thử. **Bản trợ lý chép từ ảnh** được ghi nhãn riêng trong giá trị, bằng chứng và UI, vẫn chờ duyệt. Không tính bản chép này là OCR tự động đạt.
- Kết quả bổ sung giữ tên gốc, kết quả thô và kiểu dữ liệu, đơn vị, tham chiếu, ngày có bằng chứng, panel/specimen nếu có. Phân biệt Pre và % dự đoán. Không nhập dự đoán, chú giải, Control/Label, câu hỏi hoặc ví dụ in sẵn thành kết quả bệnh nhân. Một số tên gốc còn lỗi chính tả OCR.
- 7 xét nghiệm thiếu đã kiểm tra không có kết quả được ghi: CMV IgG, LDH, Albumin, Direct Coombs, dsDNA ImmunoCAP, C3, C4. Ghi chú hỏi về Coombs không phải kết quả. Các trường khác chưa trích xuất không tự được kết luận là không có trên nguồn.
- Ngày thu mẫu IN12 vẫn cần cơ chế sửa ứng viên đã duyệt; lần này không ghi đè specimen cũ. Chưa hoàn thiện bố cục Word hoặc thử nhập REDCap thật.

## Triển khai và kiểm chứng

`ocr_pool/supplemental.py` được gọi trong pipeline chuyển đổi. `scripts/build_source_supplement.py` tạo package bổ sung riêng, dùng cùng document hashes và liên kết bệnh nhân, không tạo revision khiến kết quả cũ phải duyệt lại. Bộ ảnh phát triển dùng crop OCR lại có chọn vùng; chưa chứng minh tự động hoàn toàn trên hồ sơ khác.

- Gói nhập thật: `research/ocr-pool/bundle-20261108-source-supplement-03`, package `pkg-bf54152ccd4b97b82a0e27399a1ce575`, revision 1. Bản 01/02 chỉ là bản phát triển, không nhập.
- SQL: `research/registry-pool/registry-20261106-01.sqlite`. Backup và kiểm chứng tại `research/ocr-pool/clinical-extension-20261108-01/`: `registry-before-source-extension.sqlite`, `sql-import-verification.json`, `live-verification.json`.
- Hash các bảng quyết định duyệt và liên kết nguồn trước/sau không đổi; audit thêm một sự kiện import. SQLite integrity đạt, không lỗi khóa ngoại.
- **220 Python tests**, **2 JS controller smoke tests** đạt; 45 đường dẫn HTTP ảnh/crop/raw và tải JSON đạt. Chưa kiểm trực quan trình duyệt.
- Tự đối chiếu phát triển: **47/47 ô giá trị đã chọn trên 35 dòng bổ sung khớp bản trợ lý đọc ảnh**. Tham chiếu lập sau khi thấy OCR, chưa được người dùng xác nhận, không phải holdout. Không chấm tên/đơn vị/ngày/độ phủ/viết tay. **Không dùng làm độ chính xác OCR toàn hệ thống.** Xem `assistant-self-check.json` trong thư mục kiểm chứng trên. Tham khảo cách ghi lỗi từ [hướng dẫn Langfuse](https://langfuse.com/guides/cookbook/error-analysis-llm-applications); không cài SDK hoặc gửi dữ liệu bệnh nhân ra Langfuse.
- Toàn bộ trường: `outputs/patient-fields-20261108-02/LUPUS-000001/patient-fields.json`, gồm ứng viên chờ duyệt. Word/REDCap vẫn chỉ xuất dữ liệu đủ điều kiện sau duyệt.

Lệnh chạy server và thao tác duyệt: [PATIENT-FIELDS-REVIEW.md](PATIENT-FIELDS-REVIEW.md).
