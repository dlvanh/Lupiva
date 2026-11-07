# Phân tích trường dữ liệu từ biểu mẫu CRF

> **Xác nhận mới nhất 05/11/2026:** người dùng cho biết Word đã lọc các phần không thuộc lupus. Dùng nguyên bộ trường Word làm chuẩn, không mở rộng lại theo ảnh output. Danh mục dưới đây dùng cho [OCR → CRF](./OCR-TO-CRF-SPEC.md); các nhận xét cũ về phạm vi tự miễn rộng chỉ là bối cảnh header, không phải đề nghị thêm trường ngoài Word.

Ngày phân tích: 04/11/2026  
Nguồn: [260825_Vivi_MDDU_CRF_SLE_AI thực chiến.docx](./260825_Vivi_MDDU_CRF_SLE_AI%20thực%20chiến.docx)  
Liên quan: [Kế hoạch registry](./LUPUS-REGISTRY-PLAN.md)

Tra cứu: [Giải nghĩa mã trường, ký hiệu và chữ viết tắt](./GLOSSARY.md).

Tham khảo bổ sung: [Khảo sát hồ sơ bệnh viện Việt Nam và mô hình CURE](./HOSPITAL-FORMS-AND-CURE-RESEARCH.md), gồm quản lý mã theo cơ sở, nơi thực hiện xét nghiệm, phiên bản mẫu và nguồn xác định phương pháp. Các trường mở rộng này được đề xuất ngoài danh mục 261 mã từ CRF.

## 1. Kết luận để áp dụng vào registry

File nguồn là biểu mẫu Case Report Form chưa điền, dùng để mô tả dữ liệu dự kiến thu thập, không phải dữ liệu của một bệnh nhân đã được ghi nhận. Cụm “kết quả trích xuất từ hệ thống hoặc bản cứng” là hướng dẫn, không phải giá trị kết quả.

Danh mục bên dưới có 261 mã mục dữ liệu/tiêu chí đề xuất, bao phủ nội dung của 20 bảng và các câu hỏi ngoài bảng. Đây không phải 261 trường độc lập bắt buộc cho mỗi bệnh nhân: có mục tổng, mục thành phần, thông tin trùng khái niệm giữa các phần và mục cần nhiều thuộc tính con. CRF cũng không bảo đảm liệt kê mọi dữ liệu có thể gặp trong hồ sơ thực tế; danh mục cần mở rộng có kiểm soát khi có nguồn mới.

Biểu mẫu bao gồm thông tin nền, tiền sử, điều trị/tiêm chủng, chín nhóm cơ quan, xét nghiệm miễn dịch, phân loại SLE và đánh giá hoạt động bệnh. Header ghi “EARLY STRATIFICATION OF MAJOR SYSTEMIC AUTOIMMUNE DISEASES IN VIETNAM BASED ON SINGLE-CELL RNA SEQUENCING”, cho thấy bối cảnh rộng hơn registry SLE. Các trường liên quan viêm cơ, xơ cứng bì hoặc bệnh chồng lấp có thể được hỗ trợ khi có trong hồ sơ; mức bắt buộc cho SLE cần bác sĩ và nhóm thống nhất.

Áp dụng chính:

1. Dùng biểu mẫu làm danh mục khởi đầu, giữ toàn bộ trường và lựa chọn được nêu trong tài liệu.
2. Lưu thành các sự kiện và kết quả lặp theo thời gian, thay vì một dòng cố định cho mỗi bệnh nhân.
3. Thu thập kết quả đã có trong tài liệu. Danh sách CRF không đồng nghĩa chỉ định thực hiện tất cả xét nghiệm cho mọi bệnh nhân.
4. Giữ nguồn, ngày, đơn vị, phương pháp, trạng thái thiếu và mức kiểm chứng cho từng dữ liệu.
5. Tách thông tin đọc được từ tài liệu với diễn giải chuyên môn hoặc kết quả tính toán.
6. Cho phép tiếp nhận dữ liệu ngoài danh mục dưới dạng thông tin chưa ánh xạ để bác sĩ rà soát và mở rộng từ điển có phiên bản.

Đây là phân tích dữ liệu và đề xuất mô hình thu thập. Các mã trường và quy tắc đề xuất chưa phải đặc tả lâm sàng hoặc schema cơ sở dữ liệu đã được phê duyệt.

## 2. Phương pháp và cách đọc danh mục

Đã đọc nội dung văn bản, cấu trúc bảng, ô gộp, header/footer và các phần footnote/endnote trong gói DOCX. Có 20 bảng trong thân tài liệu, không có bảng lồng và không có nội dung sửa đổi được đánh dấu bằng tracked insertions/deletions. Footnote/endnote không cung cấp thêm trường dữ liệu có chữ; header có tên nghiên cứu nêu trên.

Phân tích dựa trên nội dung và cấu trúc OOXML. Không dùng số trang vì chưa xác minh phân trang bằng bản render; không đánh giá chất lượng trình bày của DOCX.

Ký hiệu nguồn `Bxx` là thứ tự khối cấp trực tiếp trong `word/document.xml`, tính cả khối rỗng. `Rxx` là hàng trong bảng. Đây là vị trí logic để đối chiếu nguồn, không phải số trang hoặc mã trường có sẵn trong CRF.

Các mã trường trong tài liệu này là mã đề xuất. Mỗi dòng danh mục có thể cần nhiều thuộc tính con khi triển khai; ví dụ “Creatinine” bao gồm giá trị, đơn vị, ngày lấy mẫu, nguồn và trạng thái kiểm chứng.

| Ký hiệu kiểu | Ý nghĩa |
| --- | --- |
| ID | Định danh |
| DATE | Ngày hoặc khoảng thời gian, có độ chính xác và trạng thái thiếu |
| NUM | Số kèm đơn vị/ngữ cảnh nếu áp dụng |
| CAT | Giá trị phân loại, giữ lựa chọn gốc và trạng thái chưa rõ |
| TEXT | Văn bản hoặc mô tả |
| LAB | Kết quả xét nghiệm: số, định tính, dấu so sánh, hiệu giá, khoảng hoặc văn bản |
| FINDING | Dấu hiệu/tình trạng: trạng thái, mô tả, thời gian, nguồn và mức xác nhận |
| REPORT | Báo cáo thăm dò/thủ thuật, kết luận được ghi và file nguồn |
| SCORE | Đánh giá có phiên bản, các thành phần, thời điểm và người đánh giá |

`FINDING` không phải một ô boolean đơn giản. Không có tài liệu ghi nhận không được tự chuyển thành “No”. Trường mô tả đi sau “If Yes” được giữ như chi tiết của tình trạng đó, kể cả khi tài liệu thực tế chưa cho kết luận Yes/No rõ ràng.

## 3. Bắt buộc thu thập và thông tin có điều kiện

| Mức đề xuất | Phạm vi | Cách xử lý |
| --- | --- | --- |
| Bắt buộc để quản lý bản ghi | Mã bản ghi, mã bệnh nhân hoặc trạng thái chưa gán, nguồn, thời điểm nhập, trạng thái xử lý/kiểm chứng | Hệ thống tạo hoặc ghi nhận; hồ sơ nghi sai bệnh nhân được giữ chờ làm rõ |
| Cần tìm và ghi nhận trạng thái | Ngày liên quan, cơ sở phát hành, giá trị, đơn vị, phương pháp, khoảng tham chiếu khi phù hợp | Thiếu thì ghi lý do, không tự tạo và không chặn lưu file gốc |
| Thu thập khi có | Toàn bộ thông tin lâm sàng/xét nghiệm trong danh mục CRF và tài liệu gửi | Có bằng chứng thì ghi; vắng thông tin không suy thành âm tính |
| Bắt buộc có điều kiện | Ví dụ chi tiết thuốc khi có thuốc, kết quả sinh thiết khi có sinh thiết, thành phần điểm khi cần đánh giá điểm | Thiếu làm bản ghi chưa đầy đủ hoặc chưa thể tính/duyệt |
| Bắt buộc theo đề cương | Bộ trường cốt lõi khi tuyển bệnh nhân, các mốc theo dõi và tiêu chí đầy đủ | Chưa được CRF định nghĩa đầy đủ; nhóm và bác sĩ phải chốt |

Các chữ “If female”, “If Yes”, “If ILD”, “If SLE” và dấu sao trong CRF là điều kiện của biểu mẫu. Khi xử lý hồ sơ lịch sử, vẫn giữ dữ liệu có sẵn dù không nằm trong nhánh hiển thị dự kiến; không dùng điều kiện biểu mẫu để loại bỏ bằng chứng.

## 4. Danh mục đầy đủ từ biểu mẫu

### 4.1 Thông tin nền và hành chính

Nguồn: B3.

| Mã đề xuất | Trường nguồn | Kiểu | Ghi chú thu thập |
| --- | --- | --- | --- |
| ADM01 | Study ID | ID | Tách mã nghiên cứu khỏi mã registry và mã bệnh viện |
| ADM02 | Age | NUM | Tuổi tại mốc ghi nhận; nguồn không có ngày sinh hoặc ngày tham chiếu rõ |
| ADM03 | Gender: Female / Male | CAT | Giữ nhãn nguồn; cần định nghĩa biến giới/giới tính trong từ điển |
| ADM04 | ICF signed date | DATE | Ngày ký đồng ý; file không nêu phiên bản hoặc phạm vi đồng ý |
| ADM05 | Height, cm | NUM | Lặp theo mốc đo, đặc biệt khi có bệnh nhân đang phát triển |
| ADM06 | Weight, kg | NUM | Lặp theo mốc đo |
| ADM07 | BMI | NUM | Tách số được ghi trong nguồn và số do hệ thống tính |
| ADM08 | Physician | TEXT/ID | Người phụ trách; không suy là người duyệt từng kết quả |
| ADM09 | Nurse | TEXT/ID | Người phụ trách nếu có |

### 4.2 Thai kỳ, bệnh đồng mắc và gia đình

Nguồn: B7–B22.

| Mã đề xuất | Trường nguồn | Kiểu | Cấu trúc hoặc điều kiện |
| --- | --- | --- | --- |
| HIS01 | Pregnancy / Beta-hCG | LAB | Có nhánh “If female”; không suy ra trạng thái thai kỳ chỉ từ một kết quả |
| HIS02 | Malignant disease: No / Yes, Specify | FINDING | Trạng thái và mô tả bệnh ác tính |
| HIS03 | Other comorbidities: No / Yes, Specify | FINDING | Nhiều bệnh đồng mắc, mỗi bệnh có thời gian và nguồn riêng |
| HIS04 | Family Autoimmune Disease History: No / Yes | FINDING | Lịch sử bệnh tự miễn gia đình |
| HIS05 | Father / Disease Specify | CAT + TEXT | Quan hệ cha và bệnh; cho phép nhiều bệnh |
| HIS06 | Mother / Disease Specify | CAT + TEXT | Quan hệ mẹ và bệnh |
| HIS07 | Brother / Disease Specify | CAT + TEXT | Anh/em trai; có thể nhiều người |
| HIS08 | Sister / Disease Specify | CAT + TEXT | Chị/em gái; có thể nhiều người |
| HIS09 | Child / Disease Specify | CAT + TEXT | Con; có thể nhiều người |
| HIS10 | Others / Who? Which diseases? | CAT + TEXT | Quan hệ khác và từng bệnh |

Mô hình nên dùng danh sách quan hệ gia đình và bệnh liên quan; không giới hạn một ô bệnh duy nhất cho cả gia đình. Chỉ thu thập định danh của người thân nếu có mục đích và quyền phù hợp; quan hệ và bệnh thường là thông tin chính cần thiết.

### 4.3 Sốt và nhiễm trùng

Nguồn: B24–B37.

| Mã đề xuất | Trường nguồn | Kiểu | Ghi chú |
| --- | --- | --- | --- |
| HIS11 | Fever: Yes / No | FINDING | Mỗi đợt sốt là sự kiện riêng |
| HIS12 | Temperature, highest, °C | NUM | Nhiệt độ cao nhất, không thay mọi lần đo bằng giá trị này |
| HIS13 | Date of onset | DATE | Ngày khởi phát sốt |
| HIS14 | Type: periodic / prolonged / others | CAT + TEXT | Giữ các lựa chọn và mô tả khác |
| HIS15 | History of Infection: Yes / No / Unknown | FINDING | Tách tiền sử và đợt đang diễn ra theo nguồn |
| HIS16 | Factor | TEXT | Tác nhân/yếu tố được ghi; nhãn chưa định nghĩa rõ |
| HIS17 | Date of onset | DATE | Khởi phát đợt nhiễm trùng |
| HIS18 | Date of normalization | DATE | Giữ nghĩa nguồn; cần định nghĩa kết thúc/ổn định/bình thường hóa |

Danh mục sàng lọc nhiễm trùng tại B36:

| Mã đề xuất | Xét nghiệm nguồn | Kiểu | Ghi chú |
| --- | --- | --- | --- |
| INF01 | CMV IgM | LAB | Giữ loại kháng thể |
| INF02 | CMV IgG | LAB | Giữ loại kháng thể |
| INF03 | CMV PCR* | LAB | Định tính hoặc định lượng tùy báo cáo |
| INF04 | HSV 1+2 IgM | LAB | Không tự tách HSV1/HSV2 khi nguồn là xét nghiệm gộp |
| INF05 | HSV 1+2 IgG | LAB | Như trên |
| INF06 | EBV IgM | LAB | Giữ tên kháng nguyên nếu tài liệu thực tế có |
| INF07 | EBV Real-time PCR* | LAB | Giữ phương pháp và đơn vị |
| INF08 | HBsAg | LAB | Giữ kết quả và phương pháp |
| INF09 | Anti-HBc total | LAB | Không gộp với anti-HBc IgM |
| INF10 | Anti-HBs | LAB | Giữ đơn vị và ngưỡng của phòng xét nghiệm |
| INF11 | HCV Ag/Ab | LAB | Giữ xét nghiệm gộp hoặc thành phần theo báo cáo |
| INF12 | HIV Ag/Ab | LAB | Giữ xét nghiệm gộp hoặc thành phần theo báo cáo |
| INF13 | QuantiFERON-TB | LAB | Cho phép kết quả không xác định và thành phần nếu có |

Chú thích gốc: “*Performed if IgM positive.” áp dụng cho CMV PCR và EBV Real-time PCR có dấu sao. Lưu đây là điều kiện của biểu mẫu, không tự phát sinh chỉ định xét nghiệm hoặc suy ra IgM dương từ việc có kết quả PCR.

### 4.4 Điều trị hiện tại, trước đây và tiêm chủng

Nguồn: B38–B42.

| Mã đề xuất | Trường nguồn | Kiểu | Ghi chú |
| --- | --- | --- | --- |
| TRT01 | Current/previous treatment/vaccination: No / Yes | FINDING | Giữ trạng thái tổng và các bản ghi chi tiết |
| TRT02 | Group: Medication / Vaccine / Other | CAT | Ba nhóm nguồn; mô hình có thể tách thuốc và tiêm chủng |
| TRT03 | Name | TEXT | Tên gốc; tên hoạt chất/tên chuẩn là ánh xạ riêng |
| TRT04 | Administration route | CAT/TEXT | Đường dùng |
| TRT05 | Dose | NUM/TEXT | Cần tách lượng, đơn vị, liều theo lần/ngày/cân nặng khi có |
| TRT06 | Frequency | CAT/TEXT | Tần suất, lịch dùng, khi cần hoặc theo đợt |
| TRT07 | Duration | TEXT | Khoảng dùng được ghi, giữ cả bản gốc |
| TRT08 | Begin date | DATE | Ngày bắt đầu, độ chính xác thực tế |
| TRT09 | End date | DATE | Không suy đã dừng chỉ vì thiếu đơn mới |

Lưu nhiều đợt cho cùng thuốc; thay liều tạo một giai đoạn mới. Với vaccine cần thêm ngày tiêm, mũi và sản phẩm nếu có trong tài liệu; các thuộc tính này là bổ sung đề xuất, không được ghi rõ thành cột riêng trong CRF.

### 4.5 Da và niêm mạc

Nguồn: B46–B47. Trạng thái tổng có Yes / No / Unknown. Mỗi dấu hiệu có trạng thái, mô tả, thời gian và nguồn riêng; các nhãn chứa dấu gạch chéo được giữ nguyên trước khi bác sĩ quyết định tách thuật ngữ.

| Mã đề xuất | Trường hoặc dấu hiệu nguồn | Kiểu |
| --- | --- | --- |
| SKN01 | Skin and Mucosal abnormality? | FINDING |
| SKN02 | Butterfly rash / Malar rash | FINDING |
| SKN03 | Puffy fingers / Dactylitis | FINDING |
| SKN04 | Calcinosis | FINDING |
| SKN05 | Skin sclerosis | FINDING |
| SKN06 | Alopecia | FINDING |
| SKN07 | Digital ulcers | FINDING |
| SKN08 | Oral ulcers | FINDING |
| SKN09 | Raynaud | FINDING |
| SKN10 | Cutaneous vasculitis | FINDING |
| SKN11 | Livedoid vasculopathy | FINDING |
| SKN12 | V sign | FINDING |
| SKN13 | Shawl sign | FINDING |
| SKN14 | Gottron's sign | FINDING |
| SKN15 | Heliotrope rash | FINDING |
| SKN16 | Mechanic's hands | FINDING |
| SKN17 | Inverse Gottron sign | FINDING |
| SKN18 | Photosensitive rash / Photosensitivity | FINDING |
| SKN19 | Others / Specify | FINDING + TEXT |

Ảnh có thể bổ sung vị trí cơ thể, thời điểm chụp và mô tả nếu có. Ảnh đơn thuần không tự xác nhận dấu hiệu hoặc quan hệ với SLE.

### 4.6 Cơ

Nguồn: B49–B50.

| Mã đề xuất | Trường nguồn | Kiểu | Ghi chú |
| --- | --- | --- | --- |
| MUS01 | Creatine kinase (CK) | LAB | Được đặt trước câu hỏi Muscle damage |
| MUS02 | Muscle damage?: Yes / No / Unknown | FINDING | Giữ nhãn gốc, chưa suy là tổn thương vĩnh viễn |
| MUS03 | Lactate dehydrogenase (LDH) | LAB | Nguồn đặt sau If Yes; vẫn thu nếu tài liệu có |
| MUS04 | Electromyography (EMG) | REPORT | Báo cáo, kết luận được ghi, ngày làm |
| MUS05 | Muscle MRI | REPORT | Vùng khảo sát và kết luận nếu có |
| MUS06 | Others, e.g. muscle biopsy: No / Yes, specify | REPORT/FINDING | Sinh thiết cơ là ví dụ, không phải lựa chọn duy nhất |

### 4.7 Khớp

Nguồn: B52–B53.

| Mã đề xuất | Trường nguồn | Kiểu | Ghi chú |
| --- | --- | --- | --- |
| JNT01 | Joints damage?: Yes / No / Unknown | FINDING | Cần định nghĩa “damage” |
| JNT02 | Number of swollen joints | NUM | Số nguyên không âm, giữ bộ khớp khảo sát nếu có |
| JNT03 | Number of tender joints | NUM | Như trên |
| JNT04 | Visual analogue scale (VAS), /100 | NUM | Cần xác định nội dung đánh giá và người chấm |
| JNT05 | Abnormal X-ray?: Yes / No / Unknown, specify | REPORT/FINDING | Bất thường và mô tả; nguồn không tự cho kết luận nguyên nhân |
| JNT06 | Abnormal ultrasound?: Yes / No / Unknown, specify | REPORT/FINDING | Vị trí, ngày và mô tả nếu có |
| JNT07 | Joint deformity?: Yes / No / Unknown, specify | FINDING | Vị trí và mô tả |
| JNT08 | Others: No / Yes, specify | FINDING + TEXT | Cho phép nhiều thông tin |

### 4.8 Thận

Nguồn: B55–B56.

| Mã đề xuất | Trường nguồn | Kiểu | Ghi chú |
| --- | --- | --- | --- |
| REN01 | Urine Protein Creatinine Ratio (UPCR) | LAB | Giữ đơn vị tỷ số; không gộp với protein niệu 24 giờ |
| REN02 | Haematuria (RBC in urine) | LAB | Kết quả hồng cầu niệu, giữ đơn vị và phương pháp |
| REN03 | Pyuria (WBC in urine) | LAB | Kết quả bạch cầu niệu, chưa tự quy nguyên nhân |
| REN04 | Urea | LAB | Không tự gộp với BUN |
| REN05 | Creatinine | LAB | Cần xác nhận mẫu; không gộp creatinine máu với niệu |
| REN06 | Estimated glomerular filtration rate (eGFR), ml/min/1.73 m² | LAB/NUM | Tách giá trị được báo cáo và giá trị tự tính, lưu công thức nếu có |
| REN07 | Kidneys damage?: Yes / No / Unknown | FINDING | Không tự suy từ một xét nghiệm |
| REN08 | 24 hour Proteinuria | LAB | Giữ tổng lượng và khoảng thu mẫu |
| REN09 | Albumin | LAB | Nguồn chưa chỉ rõ mẫu; phân biệt albumin máu/niệu |
| REN10 | Renal biopsy: No / Yes | REPORT | Ngày lấy mẫu, báo cáo, cơ sở và tình trạng có kết quả |
| REN11 | Class I / II / III / IV / V / VI | CAT | Giữ class theo báo cáo, hỗ trợ tổ hợp khi có |
| REN12 | IIIA / IVA / IIIC / IVC / IIIA/C / IVA/C | CAT | Giữ phân nhóm nguyên văn và hệ phân loại/phiên bản nếu có |
| REN13 | Others: No / Yes, specify | FINDING + TEXT | Thông tin thận khác |

Không ép phân loại sinh thiết thành một enum loại trừ nhau nếu báo cáo có class kết hợp. Nhóm class, phân nhóm hoạt động/mạn tính và các chỉ số khác phải được ánh xạ sau khi bác sĩ rà soát quy ước nguồn.

### 4.9 Huyết học

Nguồn: B58–B59.

| Mã đề xuất | Trường nguồn | Kiểu | Ghi chú |
| --- | --- | --- | --- |
| HEM01 | RBC (T/L): RBC | LAB | Hồng cầu máu; nhãn có chữ RBC lặp |
| HEM02 | Hb | LAB | Giữ g/L hoặc g/dL theo nguồn |
| HEM03 | MCV | LAB | Giữ đơn vị |
| HEM04 | MCHC (g/L) | LAB | Đơn vị tài liệu thực tế có thể khác |
| HEM05 | WBC | LAB | Bạch cầu máu |
| HEM06 | NE | LAB | Cần phân biệt số lượng tuyệt đối và tỷ lệ phần trăm |
| HEM07 | LY | LAB | Như trên |
| HEM08 | MO | LAB | Như trên |
| HEM09 | EO | LAB | Như trên |
| HEM10 | BA | LAB | Như trên |
| HEM11 | PLT | LAB | Tiểu cầu |
| HEM12 | Haematological disorders?: Yes / No / Unknown, specify | FINDING | Nhiều loại rối loạn, thời gian và nguồn riêng |
| HEM13 | Direct Coombs test | LAB | Giữ mức độ/thành phần nếu báo cáo có |

### 4.10 Tim mạch

Nguồn: B61–B62.

| Mã đề xuất | Trường nguồn | Kiểu |
| --- | --- | --- |
| CV01 | Cardiovascular abnormality (Echocardiography/ECG)?: Yes / No / Unknown | FINDING/REPORT |
| CV02 | Myocarditis | FINDING |
| CV03 | Pericarditis | FINDING |
| CV04 | Endocarditis | FINDING |
| CV05 | Myocardial infarction | FINDING |
| CV06 | Pericardial effusion | FINDING |
| CV07 | Pulmonary embolism | FINDING |
| CV08 | Elevated Pulmonary artery pressure | FINDING |
| CV09 | Others / Specify | FINDING + TEXT |

Các báo cáo siêu âm tim/ECG nên có bản ghi thăm dò riêng. Chỉ số đo cụ thể nếu có trong tài liệu thực tế được lưu như dữ liệu mở rộng; câu hỏi tổng không thay thế các kết quả đó. Áp lực động mạch phổi tăng được ghi nhận theo nguồn, không tự tạo chẩn đoán bổ sung.

### 4.11 Phổi và chức năng hô hấp

Nguồn: B64–B65. Có 19 dòng chỉ số hô hấp trong bảng, tương ứng 11 nhóm nhãn dưới đây khi gộp các nhãn lặp về mặt chữ. Chưa đủ căn cứ xác định các dòng lặp là trước/sau can thiệp, giá trị tuyệt đối/% dự đoán hay lỗi biên tập.

| Mã đề xuất | Nhãn nguồn | Hàng nguồn | Kiểu / lưu ý |
| --- | --- | --- | --- |
| PFT01 | VC(L) | R1, R2 | NUM; giữ hai vị trí nguồn nếu chưa xác định ngữ cảnh |
| PFT02 | FVC(L) | R3, R4 | NUM; nhãn lặp |
| PFT03 | FEV1 (L) | R5, R6 | NUM; nhãn lặp |
| PFT04 | FEV1/VC(%) | R7 | NUM; tỷ số |
| PFT05 | FEV1/FVC(%) | R8 | NUM; tỷ số |
| PFT06 | TLC (L) / TLC(L) | R9, R10 | NUM; nhãn lặp khác khoảng trắng |
| PFT07 | RV(L) | R11, R12 | NUM; nhãn lặp |
| PFT08 | RV/TLC | R13 | NUM; đơn vị chưa nêu |
| PFT09 | VA(L) / VA | R14, R15 | NUM; một dòng thiếu đơn vị |
| PFT10 | Kco Hb(mL/mmHg/Mi) / Kco Hb (mL/mmHg/Mi) | R16, R17 | NUM; chuỗi đơn vị cần xác nhận, không tự sửa |
| PFT11 | DLCO Hb (or TLco) | R18, R19 | NUM; đơn vị, hiệu chỉnh Hb và ý nghĩa dòng lặp cần xác nhận |

Với hồ sơ thực tế, lưu thêm loại giá trị (đo được/% dự đoán/z-score nếu có), điều kiện đo, thời điểm, đơn vị và hiệu chỉnh. Giữ cả nhãn gốc và ngữ cảnh để không gộp nhầm hai phép đo.

| Mã đề xuất | Trường nguồn | Kiểu / lựa chọn |
| --- | --- | --- |
| LUNG01 | Lung damage? | FINDING; Yes / No / Unknown |
| LUNG02 | Interstitial lung disease (ILD) | FINDING |
| LUNG03 | HRCT/ILD pattern conclusion | REPORT/CAT; UIP, NSIP, OP, NSIP-OP overlap, DAD, LIP, Unclassifiable pattern |
| LUNG04 | Pleuritis / Pleural effusion | FINDING; giữ nhãn gộp, tách khi nguồn đủ rõ |
| LUNG05 | Others / Specify | FINDING + TEXT |

### 4.12 Thần kinh và tâm thần

Nguồn: B67–B68.

| Mã đề xuất | Trường nguồn | Kiểu |
| --- | --- | --- |
| NEU01 | Neuropsychiatric disorders?: Yes / No / Unknown | FINDING |
| NEU02 | Seizures | FINDING |
| NEU03 | Headache | FINDING |
| NEU04 | Psychosis | FINDING |
| NEU05 | Cranial neuropathy | FINDING |
| NEU06 | Cranial arterial/venous embolism | FINDING |
| NEU07 | Others / Specify | FINDING + TEXT |

Giữ nhãn “Cranial arterial/venous embolism” trước khi bác sĩ chuẩn hóa loại biến cố và vị trí. Không tự ánh xạ mọi đau đầu thành lupus headache hoặc mọi biến cố mạch não thành một tiêu chí điểm.

### 4.13 Tiêu hóa và gan

Nguồn: B70–B71.

| Mã đề xuất | Trường nguồn | Kiểu |
| --- | --- | --- |
| GI01 | ASAT (GOT) | LAB; ánh xạ AST có kiểm soát |
| GI02 | ALAT (GPT) | LAB; ánh xạ ALT có kiểm soát |
| GI03 | GGT | LAB |
| GI04 | Gastrointestinal disorders?: Yes / No / Unknown | FINDING |
| GI05 | Constipation | FINDING |
| GI06 | Diarrhoea | FINDING |
| GI07 | IBD (UC/Crohn) | FINDING; giữ phân nhóm khi có |
| GI08 | GERD | FINDING |
| GI09 | Hepatomegaly | FINDING |
| GI10 | Splenomegaly | FINDING |
| GI11 | Ulcerative colitis | FINDING; có thể cùng bệnh với GI07, không đếm đôi |
| GI12 | Peptic ulcer | FINDING |
| GI13 | Oesophageal dysmotility | FINDING |
| GI14 | Others / Specify | FINDING + TEXT |

### 4.14 Miễn dịch và các xét nghiệm liên quan

Nguồn: B75–B77. Có 21 dòng xét nghiệm; giữ phương pháp và ngưỡng riêng cho từng kết quả.

| Mã đề xuất | Xét nghiệm nguồn | Kiểu / lưu ý |
| --- | --- | --- |
| IMM01 | ANA (pattern) | LAB; lưu kết quả, pattern và hiệu giá nếu có, không chỉ một boolean |
| IMM02 | Anti CCP | LAB |
| IMM03 | RF (Rheumatoid Factor) | LAB |
| IMM04 | dsDNA (ImmunoCAP) | LAB; giữ phương pháp ImmunoCAP như nhãn nguồn |
| IMM05 | Anticardiolipin IgG | LAB |
| IMM06 | Anticardiolipin IgM | LAB |
| IMM07 | Anti-beta2-glycoprotein I IgG | LAB |
| IMM08 | Anti-beta2-glycoprotein I IgM | LAB |
| IMM09 | Lupus anticoagulant screening (LAC/LA screen) | LAB; không đồng nhất với kết luận LA cuối cùng |
| IMM10 | Lupus anticoagulant confirmation (LAC/LA confirm) | LAB; giữ giá trị và cách diễn giải nguồn |
| IMM11 | C3 | LAB |
| IMM12 | C4 | LAB |
| IMM13 | IgE | LAB |
| IMM14 | IgA | LAB |
| IMM15 | IgG | LAB |
| IMM16 | IgM | LAB |
| IMM17 | IL-6 | LAB |
| IMM18 | KL-6 | LAB |
| IMM19 | CRP | LAB |
| IMM20 | ESR | LAB |
| IMM21 | Ferritin | LAB |

### 4.15 ANA Profile 23

Nguồn: B78–B79. Mỗi thành phần có các cột Negative / Positive / Borderline và Intensity khi Positive hoặc Borderline. Mô hình đề xuất: một lần làm panel có nhiều kết quả thành phần, mỗi thành phần giữ trạng thái và cường độ gốc. Cường độ có thể là số hoặc ký hiệu, tùy hệ xét nghiệm.

| Mã đề xuất | Thành phần nguyên văn trong nguồn | Lưu ý |
| --- | --- | --- |
| ANA01 | dsDNA | Giữ panel/phương pháp, không gộp tự động với IMM04 |
| ANA02 | Nucleosome | |
| ANA03 | Histone | |
| ANA04 | SS-A | Không mặc định đồng nhất mọi xét nghiệm SSA với Ro-52 |
| ANA05 | Ro-52 | Cũng xuất hiện trong panel viêm cơ |
| ANA06 | SS-B | |
| ANA07 | nRNP/Sm | Không tự tách thành hai kháng thể riêng |
| ANA08 | Sm | |
| ANA09 | Mi-anpha protein | Nhãn nghi sai/thiếu ký tự; cần xác nhận, không tự đổi thành Mi-2 alpha |
| ANA10 | Mi-2 beta protein | |
| ANA11 | Ku protein | |
| ANA12 | CENP A | |
| ANA13 | CENP B | |
| ANA14 | Sp100 protein | |
| ANA15 | PML protein | |
| ANA16 | Scl-70 | |
| ANA17 | PM-Scl100 protein | |
| ANA18 | PM-Scl75 protein | |
| ANA19 | RP11 | Giữ nguyên, xác nhận tên theo bộ kit |
| ANA20 | RP155 | Giữ nguyên, xác nhận tên theo bộ kit |
| ANA21 | Gp210 protein | |
| ANA22 | PCNA | |
| ANA23 | DFS70 | |

### 4.16 Autoimmune Myositis Antibody Panel

Nguồn: B80–B81. Có 16 thành phần; cấu trúc Negative / Positive / Borderline và Intensity giống bảng ANA Profile 23.

| Mã đề xuất | Thành phần nguyên văn trong nguồn | Lưu ý |
| --- | --- | --- |
| MYO01 | Mi-2 alpha | |
| MYO02 | Mi-2 beta | |
| MYO03 | TIFI-gamma | Nhãn cần bác sĩ xác nhận theo bộ kit; không tự sửa |
| MYO04 | MDA5 | |
| MYO05 | SAE1 | |
| MYO06 | Ku | |
| MYO07 | PM-Scl100 protein | |
| MYO08 | PM-Scl75 protein | |
| MYO09 | Jo-1 | |
| MYO10 | SRP | |
| MYO11 | PL-7 | |
| MYO12 | PL-12 | |
| MYO13 | EJ | |
| MYO14 | Ro-52 | |
| MYO15 | cN-1A | |
| MYO16 | HMGCR | |

Các thành phần trùng giữa hai panel có thể ánh xạ về cùng khái niệm sau rà soát, nhưng mỗi kết quả vẫn giữ lần làm, panel, phương pháp, đơn vị và nguồn riêng.

### 4.17 Phân loại SLE theo bảng 2019 EULAR/ACR trong CRF

Nguồn: B85–B87. Điểm dưới đây được chép theo biểu mẫu để lập danh mục; chưa phải thuật toán được xác thực.

Mỗi mục cần lưu trạng thái được đánh dấu/được ghi nhận, bằng chứng, thời điểm, đánh giá đủ điều kiện tính và lý do loại trừ nếu có. Ô trống của biểu mẫu chưa điền là chưa có dữ liệu, không phải tiêu chí âm tính.

| Mã đề xuất | Nhóm | Tiêu chí theo nguồn | Điểm nguồn |
| --- | --- | --- | ---: |
| EAC01 | Constitutional | Fever | 2 |
| EAC02 | Hematologic | Leukopenia | 3 |
| EAC03 | Hematologic | Thrombocytopenia | 4 |
| EAC04 | Hematologic | Autoimmune hemolysis | 4 |
| EAC05 | Neuropsychiatric | Delirium | 2 |
| EAC06 | Neuropsychiatric | Psychosis | 3 |
| EAC07 | Neuropsychiatric | Seizure | 5 |
| EAC08 | Mucocutaneous | Non-scarring alopecia | 2 |
| EAC09 | Mucocutaneous | Oral ulcers | 2 |
| EAC10 | Mucocutaneous | Subacute cutaneous OR discoid lupus | 4 |
| EAC11 | Mucocutaneous | Acute cutaneous lupus | 6 |
| EAC12 | Serosal | Pleural or pericardial effusion | 5 |
| EAC13 | Serosal | Acute pericarditis | 6 |
| EAC14 | Musculoskeletal | Joint involvement | 6 |
| EAC15 | Renal | Proteinuria >0.5 g/24h | 4 |
| EAC16 | Renal | Renal biopsy with Class II or V lupus nephritis | 8 |
| EAC17 | Renal | Renal biopsy with Class III or IV lupus nephritis | 10 |
| EAC18 | Antiphospholipid antibodies | Anti-cardiolipin OR Anti-beta2GP1 OR Lupus anticoagulant | 2 |
| EAC19 | Complement proteins | Low C3 OR low C4 | 3 |
| EAC20 | Complement proteins | Low C3 AND low C4 | 4 |
| EAC21 | SLE-specific antibodies | Anti-dsDNA OR Anti-Smith | 6 |
| EAC22 | Tổng | SLE: 2019 EULAR/ACR score, Total | Theo ghi nhận |

Quy tắc có trong nguồn:

- Không tính tiêu chí nếu có giải thích khác hợp lý hơn SLE.
- Tiêu chí xuất hiện ít nhất một lần có thể được xét.
- Có ít nhất một tiêu chí lâm sàng.
- Các tiêu chí không cần xuất hiện cùng lúc.
- Trong mỗi domain chỉ lấy tiêu chí có trọng số cao nhất.
- Phân loại SLE khi thỏa entry criterion và tổng điểm từ 10 trở lên.

Khoảng trống quan trọng: entry criterion được nhắc nhưng không được định nghĩa thành trường riêng trong bảng; nhiều định nghĩa tiêu chí chi tiết và ngưỡng/phương pháp chưa có. Cần bác sĩ đối chiếu tiêu chuẩn chính thức, đặc biệt điều kiện ANA, trước khi đặc tả tính điểm. Nguồn còn ghi sensitivity 0.96, specificity 0.93; đây là thông tin tham khảo của biểu mẫu, không phải trường bệnh nhân và không phải hiệu năng đã kiểm chứng của hệ thống registry.

### 4.18 Đánh giá hoạt động bệnh SLEDAI-2K

Nguồn: B92–B95. Có 24 mục và một tổng điểm. Mỗi mục cần bằng chứng, thời gian, trạng thái đánh giá và điều kiện loại trừ. Cột ngữ cảnh dưới đây tóm tắt nội dung nguồn để xác định dữ liệu cần giữ; phải đối chiếu nguyên văn và tiêu chuẩn chuyên môn khi đặc tả thuật toán.

| Mã đề xuất | Tiêu chí nguồn | Điểm nguồn | Ngữ cảnh/điều kiện được nêu trong CRF |
| --- | --- | ---: | --- |
| SDA01 | Seizure | 8 | Mới xuất hiện; loại nguyên nhân chuyển hóa, nhiễm trùng, thuốc |
| SDA02 | Psychosis | 8 | Rối loạn thực tại ảnh hưởng chức năng, biểu hiện tâm thần được mô tả; loại urê huyết và thuốc |
| SDA03 | Organic Brain Syndrome | 8 | Thay đổi tâm thần cấp/dao động, suy giảm định hướng/trí nhớ/nhận thức và ít nhất hai biểu hiện kèm theo; loại thuốc, nhiễm trùng, chuyển hóa |
| SDA04 | Visual Disturbance | 8 | Thay đổi võng mạc hoặc tổn thương thị giác liên quan SLE được mô tả; loại thuốc, tăng huyết áp, nhiễm trùng |
| SDA05 | Cranial Nerve Disorder | 8 | Mới xuất hiện rối loạn cảm giác/vận động dây thần kinh sọ |
| SDA06 | Lupus Headache | 8 | Đau đầu nặng, dai dẳng, có thể migraine; nguồn nêu không đáp ứng narcotic analgesics |
| SDA07 | CVA (Cerebrovascular Accident) | 8 | Biến cố mạch não mới; nguồn nêu loại arteriosclerosis |
| SDA08 | Vasculitis | 8 | Biểu hiện loét, hoại tử, tổn thương đầu ngón/quanh móng hoặc bằng chứng sinh thiết/chụp mạch |
| SDA09 | Arthritis | 4 | Ít nhất hai khớp đau và có dấu viêm |
| SDA10 | Myositis | 4 | Yếu cơ gốc chi, CK/aldolase, EMG hoặc sinh thiết theo mô tả nguồn; cần bác sĩ xác nhận logic áp dụng |
| SDA11 | Urinary Casts | 4 | Trụ hạt chứa heme hoặc trụ hồng cầu theo nguồn |
| SDA12 | Hematuria | 4 | >5 RBC/HPF; loại sỏi, nhiễm trùng hoặc nguyên nhân khác |
| SDA13 | Proteinuria | 4 | >0.5 g/24 giờ |
| SDA14 | Pyuria | 4 | >5 WBC/HPF; loại nhiễm trùng |
| SDA15 | Rash | 2 | Ban dạng viêm |
| SDA16 | Alopecia | 2 | Rụng tóc khu trú hoặc lan tỏa |
| SDA17 | Mucosal Ulcers | 2 | Loét mũi hoặc miệng |
| SDA18 | Pleurisy | 2 | Đau kiểu màng phổi và tiếng cọ, dịch hoặc dày màng phổi theo nguồn |
| SDA19 | Pericarditis | 2 | Đau kiểu màng ngoài tim và ít nhất một bằng chứng đi kèm được mô tả |
| SDA20 | Low Complement | 2 | C3, C4 hoặc CH50 dưới giới hạn bình thường |
| SDA21 | Increased DNA binding | 2 | Nguồn chỉ định Farr assay trên khoảng bình thường |
| SDA22 | Fever | 1 | >38°C; loại nhiễm trùng |
| SDA23 | Thrombocytopenia | 1 | <100 × 10^9/L; loại nguyên nhân thuốc |
| SDA24 | Leukopenia | 1 | <3 × 10^9/L; loại nguyên nhân thuốc |
| SDA25 | SLEDAI-2K score, Total | Theo ghi nhận | Giữ tổng trong nguồn, ngày, người đánh giá; tách tổng do hệ thống tính |

File không ghi rõ cửa sổ thời gian đánh giá tổng thể. Một số bằng chứng trong phần này chưa có trường chi tiết ở các phần trước: trụ niệu, CH50, aldolase, chi tiết thị giác, organic brain syndrome, loét mũi và các yếu tố loại trừ. Không được giả định các trường vắng mặt là âm tính hoặc tự tính điểm đầy đủ từ danh mục xét nghiệm hiện tại.

## 5. Thuộc tính chung cần có cho mỗi kết quả

Những thuộc tính dưới đây chủ yếu là bổ sung đề xuất cho registry, không phải toàn bộ đã có trong CRF.

### 5.1 Mẫu bản ghi xét nghiệm hoặc phép đo

| Nhóm | Thuộc tính |
| --- | --- |
| Định danh | Mã bệnh nhân, mã bản ghi, mã lần khám nếu xác định được, mã lần làm/panel |
| Nguồn | Mã tài liệu, trang/vùng hoặc đoạn, nhãn gốc, câu/giá trị nguồn |
| Ngữ nghĩa | Tên chuẩn, mã từ điển và phiên bản, mẫu bệnh phẩm, phương pháp, bộ kit/phòng xét nghiệm nếu có |
| Kết quả | Giá trị gốc, loại kết quả, giá trị số hoặc văn bản chuẩn, dấu so sánh, đơn vị gốc/chuẩn |
| Tham chiếu | Cận dưới/trên hoặc mô tả tham chiếu, cờ bất thường do nguồn ghi, điều kiện áp dụng nếu có |
| Thời gian | Ngày lấy mẫu, ngày làm, ngày trả; độ chính xác, ngày tài liệu và ngày tải lên được lưu riêng |
| Chuẩn hóa | Quy tắc ánh xạ/chuyển đổi, phiên bản, trạng thái chưa ánh xạ, lý do không chuẩn hóa được |
| Kiểm chứng | Trạng thái, người kiểm tra, thời điểm, lý do sửa, điểm máy tự đánh giá nếu có |
| Liên kết | Bản ghi cùng kết quả nhắc lại, kết quả hiệu chỉnh/thay thế, nguồn mâu thuẫn |

Một phiếu xét nghiệm có nhiều kết quả. Một kết quả có thể được dẫn lại trong nhiều tài liệu. Vì vậy cần giữ quan hệ nhiều nguồn của cùng một kết quả, đồng thời không tự gộp hai lần lấy mẫu khác nhau chỉ vì cùng giá trị.

### 5.2 Mẫu bản ghi dấu hiệu, bệnh hoặc biến cố

- Khái niệm gốc và chuẩn, trạng thái hiện diện/vắng mặt/chưa rõ theo bằng chứng.
- Mô tả, vị trí, mức độ và diễn tiến nếu có.
- Ngày khởi phát, ngày ghi nhận, ngày kết thúc hoặc khoảng thời gian.
- Nguồn tự khai, ghi nhận lâm sàng, báo cáo thăm dò hoặc đánh giá chuyên môn.
- Chẩn đoán được ghi, mức xác nhận, người đánh giá.
- Quan hệ với SLE, nguyên nhân khác và lý do loại trừ khi đã được đánh giá; chưa có đánh giá thì giữ chưa rõ.
- Liên kết sự kiện lặp hoặc cùng sự kiện được mô tả nhiều lần.

### 5.3 Mẫu bản ghi thuốc

- Tên thương mại/hoạt chất gốc và chuẩn, dạng bào chế, hàm lượng.
- Lượng mỗi lần, đơn vị, số lần, lịch dùng, đường dùng.
- Liều theo cân nặng/diện tích cơ thể, cách pha hoặc thời gian truyền nếu được ghi.
- Ngày kê, bắt đầu, kết thúc dự kiến, kết thúc thực tế nếu biết.
- Phân biệt đơn được kê, kế hoạch điều trị và việc bệnh nhân báo đang dùng.
- Trạng thái tiếp tục/ngừng/thay liều/chưa rõ, nguồn và lý do khi có.

Không coi hàm lượng viên thuốc là liều dùng mỗi lần. Không suy lịch sử dùng thuốc thực tế chỉ từ danh sách thuốc trong một giấy ra viện.

### 5.4 Mẫu đánh giá có điểm

- Tên thang điểm và phiên bản.
- Ngày đánh giá và cửa sổ thời gian áp dụng.
- Mỗi thành phần: trạng thái, bằng chứng, điều kiện, loại trừ và mức xác nhận.
- Điểm từng thành phần/domain được ghi trong nguồn.
- Tổng ghi trong nguồn và tổng hệ thống tính, lưu riêng.
- Tình trạng đủ dữ liệu, người đánh giá và phiên bản thuật toán nếu có tính.

## 6. Nguồn tài liệu có thể cung cấp từng nhóm

| Tài liệu bệnh nhân gửi | Nhóm có thể lấy | Điều cần bổ sung hoặc xác nhận |
| --- | --- | --- |
| Phiếu xét nghiệm | Huyết học, sinh hóa, nước tiểu, miễn dịch, nhiễm trùng, beta-hCG | Đúng bệnh nhân, ngày mẫu, đơn vị, phương pháp, khoảng tham chiếu |
| Đơn thuốc / kế hoạch điều trị | Tên thuốc, hàm lượng, liều, lịch, đường dùng, ngày kê | Thực tế đã dùng chưa, thời gian dùng, thay liều/ngừng |
| Giấy khám / giấy ra viện / bệnh án | Chẩn đoán, triệu chứng, biểu hiện cơ quan, tiền sử, đợt điều trị, điểm được ghi | Thời điểm thực sự của từng sự kiện, thông tin chép lại từ hồ sơ cũ |
| Báo cáo siêu âm / X-quang / MRI / HRCT / ECG / EMG | Thăm dò, vị trí, phép đo, kết luận được ghi | Phân biệt kết luận báo cáo với chẩn đoán/quan hệ nguyên nhân |
| Báo cáo sinh thiết | Mẫu, ngày, mô tả, class và chỉ số nếu có | Hệ phân loại, tổ hợp class, đánh giá bác sĩ |
| Phiếu chức năng hô hấp | Chỉ số PFT và điều kiện đo | Giá trị đo/% dự đoán, trước/sau can thiệp, đơn vị, hiệu chỉnh |
| Phiếu kháng thể theo panel | Từng thành phần, định tính, cường độ | Panel, kit, phương pháp và ngưỡng |
| Ảnh tổn thương / ảnh cá nhân liên quan bệnh | Tư liệu hình ảnh, ngày, vị trí, mô tả tự khai | Xác nhận chuyên môn về dấu hiệu và nguyên nhân |
| Văn bản bệnh nhân tự viết | Triệu chứng, diễn tiến tự khai, thuốc thực dùng, tiền sử | Giữ trạng thái tự khai; bác sĩ xác nhận khi cần |
| Biểu mẫu đồng ý / dữ liệu tuyển bệnh | ICF, mã nghiên cứu, vai trò phụ trách | Phiên bản, phạm vi đồng ý, nguồn xác nhận |

## 7. Các điểm cần bác sĩ rà soát trước khi chốt từ điển

| Vấn đề | Bằng chứng trong nguồn | Ảnh hưởng và cách xử lý đề xuất |
| --- | --- | --- |
| Phạm vi rộng hơn SLE | Header nghiên cứu bệnh tự miễn hệ thống, nhiều dấu hiệu viêm cơ/xơ cứng bì | Chọn bộ cốt lõi SLE; vẫn hỗ trợ dữ liệu khác khi có |
| “ORGANS DAMAGE” chưa định nghĩa | Có cả triệu chứng, hoạt động bệnh và phép đo trong mục này | Giữ nhãn nguồn; tách biểu hiện, hoạt động và tổn thương tích lũy sau rà soát |
| PFT lặp | 19 dòng chỉ số, 11 nhóm nhãn | Không mặc định trước/sau hoặc % dự đoán; cần xác định từng cặp |
| Đơn vị Kco không rõ | “mL/mmHg/Mi” | Giữ chuỗi gốc và yêu cầu xác nhận đơn vị |
| Tên kháng thể không rõ | “Mi-anpha protein”, “TIFI-gamma”, RP11, RP155 | Xác nhận theo kit/tài liệu; không âm thầm sửa tên |
| Một số nhãn gộp | Puffy fingers/Dactylitis, Pleuritis/Pleural effusion, nRNP/Sm | Không tự coi là đồng nghĩa; chỉ tách khi có bằng chứng |
| Albumin và Creatinine thiếu mẫu | Phần thận không nêu rõ mẫu cho mọi xét nghiệm | Không gộp máu/niệu; yêu cầu ngữ cảnh từ phiếu gốc |
| Công thức bạch cầu thiếu loại giá trị | NE, LY, MO, EO, BA | Tách số tuyệt đối và %, giữ đơn vị |
| ANA thiếu cấu trúc chi tiết | Nhãn “ANA (pattern)” | Cần kết quả, hiệu giá, pattern, phương pháp và ngưỡng khi có |
| Điều kiện EULAR/ACR chưa đủ | Có câu entry criterion nhưng thiếu trường/định nghĩa chi tiết | Bác sĩ đối chiếu chuẩn trước khi xây tính điểm |
| Cửa sổ SLEDAI-2K chưa rõ | Không có khoảng thời gian đánh giá tổng thể | Bổ sung ngày đánh giá và cửa sổ được bác sĩ thống nhất |
| Phương pháp anti-dsDNA không đồng nhất | ImmunoCAP, dsDNA trong panel và Farr assay ở định nghĩa điểm | Giữ riêng từng phương pháp, không tự quy đổi mức đáp ứng tiêu chí |
| Bằng chứng điểm thiếu ở phần thu thập trước | Trụ niệu, CH50, aldolase, thị giác, yếu tố loại trừ | Bổ sung trường khi mục tiêu gồm tính/kiểm tra điểm |
| VAS chưa rõ ý nghĩa | Chỉ ghi “VAS /100” | Xác định đánh giá gì, ai chấm, mốc thời gian |
| Thông tin tiêu hóa giao nhau | IBD (UC/Crohn) và Ulcerative colitis | Liên kết cùng bệnh khi phù hợp để tránh đếm đôi |
| Trùng biểu hiện giữa nhiều phần | Sốt, khớp, da, thận, màng tim và tiêu chí điểm | Dùng chung bằng chứng, tạo đánh giá tiêu chí riêng theo thời điểm |
| Tuổi thiếu mốc | Chỉ có Age | Giữ tuổi theo nguồn và ngày ghi; không tự tạo ngày sinh chính xác |
| Nhánh thai kỳ | “If female” và beta-hCG | Xác định điều kiện theo đề cương; không suy tình trạng thai kỳ từ biến giới |
| Sinh thiết thận nhiều cách ghi class | Class I–VI, IIIA/IVA/IIIC/IVC/IIIA/C/IVA/C | Lưu class, tổ hợp và phiên bản; không ép loại trừ nhau |
| Bệnh viện/đơn vị chưa có cột riêng | Có Physician/Nurse nhưng thiếu cơ sở/encounter | Bổ sung cơ sở và lần khám cho nguồn và dòng thời gian |

Những vấn đề trên là điểm cần làm rõ về dữ liệu, chưa khẳng định biểu mẫu hoặc một kết luận lâm sàng là sai. Tài liệu này chưa thực hiện đối chiếu hướng dẫn y khoa chính thức bên ngoài.

## 8. Dữ liệu cần bổ sung ngoài CRF để registry vận hành

### 8.1 Bổ sung cho quản lý và chất lượng

- Mã registry, mã bệnh viện/mã nghiên cứu và cơ sở cấp mã; quy trình xử lý trùng bệnh nhân.
- Ngày sinh nếu có căn cứ và cần thiết; tuổi tại sự kiện khi chỉ có tuổi.
- Người gửi, người đại diện, thời điểm gửi và phạm vi được ủy quyền.
- Mã tài liệu, loại file, dấu nhận diện file, trang, cơ sở phát hành, ngày tài liệu.
- Lần khám, đợt nhập viện và quan hệ giữa tài liệu với sự kiện.
- Phiên bản/phạm vi đồng ý, thay đổi trạng thái tham gia theo chính sách.
- Nguồn từng dữ liệu, lịch sử sửa, phiên bản OCR/AI và từ điển.
- Trạng thái thiếu, chưa ánh xạ, mâu thuẫn và chờ bác sĩ.

### 8.2 Bổ sung chuyên môn cần xem xét, chưa mặc định bắt buộc

- Ngày khởi phát bệnh, ngày chẩn đoán, cơ sở/người chẩn đoán và trạng thái xác nhận.
- Các trường bằng chứng còn thiếu cho thang điểm như liệt kê ở phần 4.18 và 7.
- Huyết áp, dị ứng, tác dụng không mong muốn, đợt bùng phát, nhập viện và kết cục nếu phù hợp mục tiêu registry và có trong nguồn.
- Bối cảnh thai kỳ, nhiễm trùng, điều trị và bệnh đồng mắc ở từng mốc nếu có ý nghĩa cho dữ liệu theo dõi.
- Định nghĩa mốc tái khám và bộ dữ liệu tối thiểu mỗi mốc theo đề cương.

Danh mục mở rộng phải được bác sĩ và nhóm xác định ưu tiên. Hệ thống vẫn giữ tài liệu chứa dữ liệu ngoài danh mục để có thể bổ sung cấu trúc về sau.

## 9. Cấu trúc lưu trữ logic đề xuất

| Đối tượng | Quan hệ và mục đích |
| --- | --- |
| Patient / PatientIdentifier | Một bệnh nhân có nhiều mã theo cơ sở/nghiên cứu |
| ConsentRecord | Một bệnh nhân có nhiều phiên bản hoặc sự kiện đồng ý |
| Document / Submission | Một lần gửi có nhiều file; một file có nhiều loại nội dung |
| Encounter / ClinicalEvent | Một bệnh nhân có nhiều lần khám và biến cố |
| Observation | Một bệnh nhân có nhiều kết quả/đo lường, mỗi lần giữ thời điểm và ngữ cảnh |
| Panel / PanelComponent | Một lần làm panel có nhiều thành phần |
| Condition / ClinicalFinding | Lưu bệnh, biểu hiện và thời gian với mức xác nhận |
| MedicationRecord / VaccinationRecord | Nhiều giai đoạn dùng thuốc hoặc lần tiêm |
| Procedure / DiagnosticReport | Thăm dò, sinh thiết, hình ảnh và báo cáo |
| FamilyHistoryRecord | Nhiều quan hệ và bệnh trong gia đình |
| Assessment / AssessmentItem | Nhiều lần đánh giá có điểm và bằng chứng từng thành phần |
| EvidenceLink / ReviewRecord / Revision | Nhiều nguồn, đối chiếu, lịch sử sửa và mâu thuẫn |

Đây là cấu trúc khái niệm, chưa quyết định tên bảng hoặc công nghệ triển khai. Tránh thiết kế một bảng rộng có một cột cố định cho mọi xét nghiệm và chỉ giữ giá trị mới nhất. Có thể tạo bản xem tóm tắt hiện tại từ lịch sử đầy đủ.

## 10. Mức ưu tiên thực hiện

| Đợt | Nội dung | Kết quả cần đạt |
| --- | --- | --- |
| A | Nguồn, định danh, thời gian, trạng thái thiếu/kiểm chứng | Mọi dữ liệu có thể truy nguồn và không gán nhầm bệnh nhân |
| B | Xét nghiệm thường gặp, thuốc, lần khám và chẩn đoán được ghi | Thực hiện được luồng trích xuất–đối chiếu–dòng thời gian |
| C | Các nhóm cơ quan, panel kháng thể, thăm dò/sinh thiết | Bao phủ danh mục CRF, giữ ngữ cảnh và tránh trùng |
| D | EULAR/ACR, SLEDAI-2K như các đánh giá có nguồn | Lưu điểm được ghi và bằng chứng; chỉ tính sau khi đủ đặc tả/kiểm chứng |

Ưu tiên triển khai không được dùng để xóa bỏ trường chưa hỗ trợ. Các nội dung đó cần được giữ nguyên trong hồ sơ gốc, có trạng thái chưa cấu trúc hóa.

## 11. Kiểm tra độ bao phủ trước khi dùng thực tế

1. Bác sĩ rà soát toàn bộ danh mục, đặc biệt trường gộp, tên kháng thể, PFT và định nghĩa điểm.
2. Chọn tài liệu mẫu đại diện từng loại: xét nghiệm, đơn thuốc, giấy khám, sinh thiết, panel, PFT và ảnh.
3. Ánh xạ từng nội dung có trong mẫu vào trường và đánh dấu phần chưa có trong danh mục.
4. Đánh giá việc đọc đúng, bỏ sót, ánh xạ đúng và giữ đủ nguồn/thời gian/đơn vị; đo riêng theo nhóm trường.
5. Kiểm tra các tình huống: một kết quả được nhắc lại, hai kết quả cùng tên khác ngày, đơn vị khác, phương pháp khác, tài liệu hiệu chỉnh, thiếu trang, ô trống và nhãn sai chính tả.
6. Chốt bộ trường tối thiểu và tiêu chí đầy đủ cho tuyển bệnh/theo dõi; ghi riêng với điều kiện tiếp nhận file.
7. Đóng phiên bản từ điển v1 và lưu các quyết định chuyên môn trước khi xây luồng trích xuất chính thức.

## 12. Bảng đối chiếu bao phủ nguồn

| Vị trí nguồn | Nội dung | Phần danh mục |
| --- | --- | --- |
| B3 | Bảng hành chính | 4.1 |
| B9 | Beta-hCG | 4.2 |
| B22 | Tiền sử tự miễn gia đình | 4.2 |
| B34 | Yếu tố nhiễm trùng và ngày | 4.3 |
| B36 | 13 xét nghiệm nhiễm trùng | 4.3 |
| B42 | Điều trị/tiêm chủng | 4.4 |
| B47 | Da/niêm mạc | 4.5 |
| B50 | Cơ | 4.6 |
| B53 | Khớp | 4.7 |
| B56 | Thận | 4.8 |
| B59 | Huyết học | 4.9 |
| B62 | Tim mạch | 4.10 |
| B65 | Phổi/PFT | 4.11 |
| B68 | Thần kinh/tâm thần | 4.12 |
| B71 | Tiêu hóa/gan | 4.13 |
| B77 | 21 xét nghiệm miễn dịch/liên quan | 4.14 |
| B79 | 23 thành phần ANA Profile | 4.15 |
| B81 | 16 thành phần panel viêm cơ | 4.16 |
| B87 | 21 tiêu chí phân loại và quy tắc | 4.17 |
| B95 | 24 tiêu chí hoạt động bệnh và định nghĩa | 4.18 |
| B7–B8, B11–B20 | Nhãn thai kỳ, bệnh đồng mắc và tiền sử gia đình ngoài bảng | 4.2 |
| B24–B33, B35, B37 | Sốt, tiền sử nhiễm trùng, chú thích PCR | 4.3 |
| B38–B40 | Trạng thái điều trị ngoài bảng | 4.4 |
| B85–B86, B92–B94 | Tổng điểm và điều kiện đánh giá ngoài bảng | 4.17–4.18 |

Tổng số mã danh mục không đồng nghĩa số khái niệm y khoa duy nhất hoặc số cột cần tạo. Các phần lặp, nhãn gộp, thuộc tính con và đánh giá theo thời gian được mô tả riêng để tránh tạo thống kê sai về độ bao phủ.
