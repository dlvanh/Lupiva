# Giải nghĩa ký hiệu trong tài liệu registry lupus

Tài liệu này dùng cùng [bản phân tích CRF](./CRF-DATA-ANALYSIS.md) và [kế hoạch registry](./LUPUS-REGISTRY-PLAN.md). Các giải nghĩa giúp đọc tài liệu và thiết kế dữ liệu; việc diễn giải kết quả cụ thể phụ thuộc hồ sơ và đánh giá chuyên môn.

## 1. Cách đọc một dòng trong danh mục

Ví dụ: `REN01 | Urine Protein Creatinine Ratio (UPCR) | LAB`.

- `REN01`: mã do bản phân tích đặt cho mục số 01 trong nhóm thận.
- `Urine Protein Creatinine Ratio`: tỷ số protein/creatinine trong nước tiểu.
- `UPCR`: chữ viết tắt y khoa của tỷ số này.
- `LAB`: mục này được lưu theo cấu trúc kết quả xét nghiệm.

Các mã như REN01 hay IMM04 là mã nội bộ đề xuất cho danh mục, không phải mã bệnh, mã xét nghiệm tiêu chuẩn hoặc mã có sẵn trong CRF. Số cuối không biểu thị mức độ nặng, điểm bệnh hoặc thứ tự ưu tiên.

## 2. Mã nhóm do bản phân tích sử dụng

| Mã đầu | Nhóm dữ liệu | Ví dụ |
| --- | --- | --- |
| ADM | Hành chính và thông tin nền | ADM01: Study ID |
| HIS | Tiền sử và bối cảnh bệnh | HIS11: sốt |
| INF | Xét nghiệm nhiễm trùng | INF01: CMV IgM |
| TRT | Điều trị và tiêm chủng | TRT05: liều |
| SKN | Da và niêm mạc | SKN06: rụng tóc |
| MUS | Cơ | MUS01: CK |
| JNT | Khớp | JNT04: VAS |
| REN | Thận | REN01: UPCR |
| HEM | Huyết học | HEM01: RBC |
| CV | Tim mạch | CV02: viêm cơ tim |
| PFT | Chức năng hô hấp | PFT03: FEV1 |
| LUNG | Biểu hiện và báo cáo liên quan phổi | LUNG02: ILD |
| NEU | Thần kinh và tâm thần | NEU02: co giật |
| GI | Tiêu hóa và gan | GI01: AST/ASAT |
| IMM | Xét nghiệm miễn dịch và liên quan | IMM11: C3 |
| ANA | Các thành phần trong ANA Profile 23 | ANA01: dsDNA |
| MYO | Các thành phần trong panel kháng thể viêm cơ | MYO04: MDA5 |
| EAC | Thành phần đánh giá EULAR/ACR trong danh mục | EAC22: tổng điểm được ghi |
| SDA | Thành phần đánh giá SLEDAI-2K trong danh mục | SDA25: tổng điểm được ghi |

Lưu ý: `ANA01` là mã nội bộ; `ANA` đứng riêng trong y khoa thường là xét nghiệm kháng thể kháng nhân. `PFT01` là mã nội bộ; PFT cũng là chữ viết tắt thường dùng của pulmonary function tests, tức các thăm dò chức năng hô hấp.

## 3. Ký hiệu về vị trí nguồn

| Ký hiệu | Ý nghĩa |
| --- | --- |
| B3, B36, B95… | Khối thứ 3, 36, 95… trong cấu trúc thân file Word, tính cả khối rỗng |
| R1, R2… | Hàng thứ 1, thứ 2… trong bảng đang nói tới |
| B65 R5 | Hàng 5 của bảng ở khối 65 |
| B7–B22 | Khoảng khối từ 7 đến 22 |
| 4.11 | Số mục trong bản phân tích, không phải kết quả xét nghiệm |

`B` và `R` giúp đối chiếu cấu trúc file nguồn; không phải số trang. Sau khi chỉnh sửa file Word, vị trí cấu trúc có thể thay đổi.

## 4. Ký hiệu kiểu dữ liệu

| Ký hiệu | Nghĩa | Ví dụ |
| --- | --- | --- |
| ID | Định danh | Mã bệnh nhân, mã nghiên cứu |
| DATE | Ngày hoặc khoảng thời gian | Ngày khám, tháng/năm khởi phát |
| NUM | Số | Cân nặng 52 kg, số khớp sưng |
| CAT | Giá trị thuộc danh sách phân loại | Yes / No / Unknown |
| TEXT | Văn bản tự do | Mô tả triệu chứng |
| LAB | Kết quả xét nghiệm có giá trị, đơn vị, thời gian và nguồn | Creatinine, ANA, kết quả PCR |
| FINDING | Dấu hiệu hoặc tình trạng có trạng thái, mô tả, thời gian và bằng chứng | Có ban da, chưa rõ tiền sử nhiễm trùng |
| REPORT | Báo cáo thăm dò hoặc thủ thuật | Báo cáo MRI, sinh thiết |
| SCORE | Đánh giá có điểm và các thành phần | SLEDAI-2K |
| CAT + TEXT | Giá trị phân loại kèm phần mô tả | Quan hệ gia đình và tên bệnh |
| NUM/TEXT | Cho phép cấu trúc số hoặc diễn đạt bằng chữ khi nguồn chưa tách rõ | Liều ghi theo lịch phức tạp |
| REPORT/FINDING | Có thể cần cả bản ghi báo cáo và tình trạng được ghi nhận | Kết luận bất thường trên X-quang |

Đây là kiểu ở mức khái niệm để đọc danh mục, chưa phải kiểu cột SQL. `LAB` có thể là số, định tính hoặc văn bản; `FINDING` cần nhiều thông tin hơn một ô Có/Không.

## 5. Trạng thái, dấu và phép nối

| Ký hiệu/từ | Giải nghĩa |
| --- | --- |
| Yes / No / Unknown | Có / Không / Chưa rõ theo thông tin được ghi nhận |
| Negative / Positive / Borderline | Âm tính / Dương tính / Giáp ranh theo cách phân loại của xét nghiệm |
| Intensity | Cường độ tín hiệu, có thể là số hoặc ký hiệu tùy bộ xét nghiệm |
| Pattern | Kiểu hình/kiểu bắt màu được báo cáo, ví dụ trong ANA |
| Titer / titre | Hiệu giá; có thể ghi dưới dạng tỷ lệ pha loãng như 1:160 |
| Specify | Ghi rõ thông tin chi tiết |
| If Yes / If ILD / If SLE | Nếu Có / Nếu có ILD / Nếu thuộc nhánh SLE của biểu mẫu |
| OR | Hoặc: ít nhất một điều kiện; quy tắc chấm điểm còn phụ thuộc tiêu chí cụ thể |
| AND | Và: đồng thời thỏa các điều kiện |
| > / < | Lớn hơn / nhỏ hơn |
| ≥ / ≤ | Lớn hơn hoặc bằng / nhỏ hơn hoặc bằng |
| * | Dấu dẫn tới chú thích. Trong CRF, một số PCR có chú thích về IgM dương tính |
| / | Tùy ngữ cảnh: tỷ số, đơn vị “trên”, nhãn gộp hoặc lựa chọn; không mặc định hai thuật ngữ đồng nghĩa |
| +, ++, +++ | Có thể là mức cường độ theo bộ xét nghiệm; phải giữ ý nghĩa của phòng xét nghiệm |
| Ô trống | Chưa có dữ liệu trong biểu mẫu; không tự hiểu là No hoặc Negative |

`Unknown` khác với “không được tài liệu đề cập”, “chưa làm xét nghiệm” hoặc “không đọc được”. Registry cần giữ các trạng thái thiếu này riêng khi xác định được.

## 6. Viết tắt chung về hồ sơ và bệnh lupus

| Ký hiệu | Tên/ý nghĩa |
| --- | --- |
| CRF | Case Report Form: phiếu thu thập dữ liệu nghiên cứu |
| ICF | Informed Consent Form: phiếu đồng ý tham gia sau khi được cung cấp thông tin |
| SLE | Systemic Lupus Erythematosus: lupus ban đỏ hệ thống |
| BMI | Body Mass Index: chỉ số khối cơ thể, thường tính bằng cân nặng kg chia bình phương chiều cao m |
| VAS | Visual Analogue Scale: thang đánh giá bằng đường trực quan; CRF ghi thang /100 nhưng chưa nêu rõ nội dung đánh giá |
| EULAR | Tổ chức chuyên môn thấp khớp châu Âu; tên hiện tại là European Alliance of Associations for Rheumatology |
| ACR | American College of Rheumatology: tổ chức chuyên môn thấp khớp Hoa Kỳ |
| EULAR/ACR 2019 | Bộ tiêu chuẩn phân loại SLE năm 2019 của EULAR/ACR |
| SLEDAI-2K | Systemic Lupus Erythematosus Disease Activity Index 2000: chỉ số đánh giá hoạt động bệnh SLE, phiên bản 2000 |
| Domain | Nhóm tiêu chí trong một bộ đánh giá, như huyết học hoặc thận |
| Entry criterion | Điều kiện đầu vào cần thỏa trước khi áp dụng bộ tiêu chuẩn |
| CVA | Cerebrovascular Accident: tai biến/biến cố mạch máu não trong ngữ cảnh tiêu chí nguồn |

Điểm phân loại SLE, mức độ hoạt động bệnh và chẩn đoán của bác sĩ là ba thông tin khác nhau. Không dùng một chữ viết tắt hoặc tổng điểm đơn lẻ để tự thay thế kết luận chuyên môn.

## 7. Huyết học, sinh hóa và nước tiểu

| Ký hiệu | Giải nghĩa |
| --- | --- |
| RBC | Red Blood Cells: hồng cầu; phải phân biệt trong máu và trong nước tiểu |
| Hb / Hgb | Hemoglobin: huyết sắc tố |
| MCV | Mean Corpuscular Volume: thể tích trung bình hồng cầu |
| MCHC | Mean Corpuscular Hemoglobin Concentration: nồng độ huyết sắc tố trung bình hồng cầu |
| WBC | White Blood Cells: bạch cầu; phải phân biệt mẫu máu và nước tiểu |
| NE / NEU | Neutrophils: bạch cầu trung tính; có thể là số tuyệt đối hoặc tỷ lệ |
| LY / LYM | Lymphocytes: tế bào lympho; có thể là số tuyệt đối hoặc tỷ lệ |
| MO / MONO | Monocytes: bạch cầu mono |
| EO / EOS | Eosinophils: bạch cầu ái toan |
| BA / BASO | Basophils: bạch cầu ái kiềm |
| PLT | Platelets: tiểu cầu |
| Direct Coombs / DAT | Direct Antiglobulin Test: xét nghiệm kháng globulin trực tiếp trên hồng cầu |
| CK | Creatine Kinase: enzyme creatine kinase |
| LDH | Lactate Dehydrogenase: enzyme lactate dehydrogenase |
| AST / ASAT / GOT | Các tên thường gặp của enzyme aspartate aminotransferase |
| ALT / ALAT / GPT | Các tên thường gặp của enzyme alanine aminotransferase |
| GGT | Gamma-glutamyl transferase: enzyme gamma-glutamyl transferase |
| CRP | C-reactive protein: protein phản ứng C |
| ESR | Erythrocyte Sedimentation Rate: tốc độ máu lắng |
| UPCR | Urine Protein-to-Creatinine Ratio: tỷ số protein/creatinine niệu |
| eGFR | Estimated Glomerular Filtration Rate: mức lọc cầu thận ước tính |
| BUN | Blood Urea Nitrogen: nitơ urê máu; khác cách biểu thị với urê |
| HPF | High-Power Field: vi trường kính hiển vi ở độ phóng đại cao |
| RBC/HPF | Số hồng cầu trên một vi trường ở độ phóng đại cao |
| WBC/HPF | Số bạch cầu trên một vi trường ở độ phóng đại cao |
| Proteinuria | Protein niệu; phải giữ cách đo, như g/24 giờ hoặc tỷ số UPCR |
| Hematuria / Haematuria | Hồng cầu trong nước tiểu/tiểu máu theo ngữ cảnh |
| Pyuria | Bạch cầu trong nước tiểu; không tự đồng nghĩa nhiễm trùng |
| Urinary casts | Trụ niệu; loại trụ cần được ghi riêng |

Tên xét nghiệm giống nhau chưa đủ để gộp kết quả nếu mẫu, đơn vị hoặc phương pháp khác nhau.

## 8. Nhiễm trùng và thai kỳ

| Ký hiệu | Giải nghĩa |
| --- | --- |
| Beta-hCG / β-hCG | Tiểu đơn vị beta của human chorionic gonadotropin, thường gặp trong xét nghiệm liên quan thai kỳ |
| CMV | Cytomegalovirus: virus cytomegalo |
| HSV 1+2 | Herpes Simplex Virus type 1 và type 2; trong CRF là nhãn xét nghiệm gộp |
| EBV | Epstein–Barr Virus |
| HBV | Hepatitis B Virus: virus viêm gan B |
| HBsAg | Kháng nguyên bề mặt của virus viêm gan B |
| Anti-HBc total | Tổng kháng thể kháng kháng nguyên lõi virus viêm gan B |
| Anti-HBs | Kháng thể kháng kháng nguyên bề mặt virus viêm gan B |
| HCV | Hepatitis C Virus: virus viêm gan C |
| HIV | Human Immunodeficiency Virus: virus gây suy giảm miễn dịch ở người |
| Ag | Antigen: kháng nguyên |
| Ab / Anti- | Antibody / kháng: dùng trong tên kháng thể hướng tới một đích |
| Ag/Ab | Xét nghiệm kháng nguyên/kháng thể; giữ tên bộ xét nghiệm và thành phần nếu có |
| IgG / IgM | Immunoglobulin G / M: các lớp kháng thể; không dùng riêng để tự kết luận thời điểm nhiễm |
| PCR | Polymerase Chain Reaction: phản ứng chuỗi polymerase để phát hiện/khuếch đại vật liệu di truyền |
| Real-time PCR | PCR theo dõi tín hiệu trong quá trình phản ứng; có thể dùng cho kết quả định tính hoặc định lượng |
| TB | Tuberculosis: bệnh lao |
| QuantiFERON-TB | Tên một nhóm xét nghiệm đáp ứng interferon-gamma đối với kháng nguyên lao; không tự xác định bệnh lao hoạt động |

## 9. Miễn dịch và kháng thể

Trong bảng panel, tên một đích như Sm, Ku hoặc MDA5 thường được dùng để đặt tên xét nghiệm kháng thể chống đích đó. Cần giữ đầy đủ tên xét nghiệm thực tế, panel và phương pháp.

| Ký hiệu/tên | Giải nghĩa |
| --- | --- |
| ANA | Antinuclear Antibodies: kháng thể kháng nhân |
| ANA Profile 23 | Panel gồm 23 thành phần được liệt kê trong CRF; thành phần/phương pháp thực tế phụ thuộc bộ xét nghiệm |
| dsDNA | Double-stranded DNA: DNA sợi kép; anti-dsDNA là kháng thể kháng DNA sợi kép |
| Anti-CCP | Kháng thể kháng cyclic citrullinated peptide |
| RF | Rheumatoid Factor: yếu tố dạng thấp |
| Anti-Smith / Sm | Kháng thể chống kháng nguyên Smith |
| Anticardiolipin | Kháng thể kháng cardiolipin; giữ lớp IgG/IgM |
| β2GP1 / beta2-glycoprotein I | Beta-2-glycoprotein I; trong xét nghiệm thường là đích của kháng thể |
| LA / LAC | Lupus anticoagulant: chất kháng đông lupus, được đánh giá bằng nhóm xét nghiệm đông máu |
| LA screen / LA confirm | Bước sàng lọc / xác nhận của xét nghiệm LA; không đồng nhất mỗi giá trị với kết luận cuối |
| C3 / C4 | Thành phần bổ thể C3 / C4 |
| CH50 | Phép đo hoạt tính tan máu toàn phần của đường bổ thể cổ điển |
| IgA / IgE / IgG / IgM | Các lớp immunoglobulin A / E / G / M |
| IL-6 | Interleukin-6: một cytokine |
| KL-6 | Krebs von den Lungen-6: một dấu ấn glycoprotein được đo trong xét nghiệm |
| SS-A / SSA / Ro | Nhóm kháng nguyên Ro/SS-A; không tự gộp mọi xét nghiệm SSA với Ro-52 |
| Ro-52 | Kháng nguyên Ro52; kết quả kháng thể cần giữ phương pháp và panel |
| SS-B / SSB / La | Kháng nguyên La/SS-B; thường xuất hiện dưới tên xét nghiệm anti-SSB |
| nRNP/Sm | Nhãn kháng nguyên phức hợp nuclear ribonucleoprotein/Sm trong panel nguồn; không tự tách thành hai kết quả |
| CENP A / CENP B | Centromere protein A / B: protein vùng tâm động |
| PCNA | Proliferating Cell Nuclear Antigen: kháng nguyên nhân tế bào tăng sinh |
| DFS70 | Dense Fine Speckled 70: tên đích kháng nguyên; cần phân biệt với mô tả pattern đơn thuần |
| Scl-70 | Tên kháng nguyên thường dùng cho DNA topoisomerase I |
| PM-Scl75 / PM-Scl100 | Các đích kháng nguyên 75/100 trong phức hợp PM-Scl |
| Mi-2 alpha / Mi-2 beta | Các đích kháng nguyên Mi-2 alpha/beta trong panel kháng thể |
| Ku | Đích kháng nguyên Ku, một phức hợp protein liên quan gắn DNA |
| Sp100 | Protein nhân Sp100, một đích kháng nguyên |
| PML | Promyelocytic Leukemia Protein: tên protein; tên này trong panel không phải chẩn đoán bệnh bạch cầu |
| Gp210 | Glycoprotein 210, một đích kháng nguyên thuộc phức hợp lỗ nhân |
| MDA5 | Melanoma Differentiation-Associated Protein 5: tên đích kháng nguyên |
| SAE1 | Tiểu đơn vị 1 của enzyme hoạt hóa SUMO: tên đích kháng nguyên |
| Jo-1 | Tên kháng nguyên histidyl-tRNA synthetase |
| SRP | Signal Recognition Particle: hạt nhận diện tín hiệu |
| PL-7 | Tên kháng nguyên threonyl-tRNA synthetase |
| PL-12 | Tên kháng nguyên alanyl-tRNA synthetase |
| EJ | Tên kháng nguyên glycyl-tRNA synthetase |
| cN-1A | Cytosolic 5′-nucleotidase 1A: tên đích kháng nguyên |
| HMGCR | 3-hydroxy-3-methylglutaryl-coenzyme A reductase: tên enzyme/đích kháng nguyên |
| Nucleosome | Cấu trúc gồm DNA và protein histone; là đích của xét nghiệm trong panel |
| Histone | Nhóm protein liên quan đóng gói DNA; là đích của xét nghiệm trong panel |
| ImmunoCAP | Tên nền tảng/phương pháp được ghi trong nhãn nguồn; cần xác nhận theo phiếu xét nghiệm thực tế |
| Farr assay | Một phương pháp xét nghiệm khả năng gắn DNA được nhắc trong định nghĩa điểm nguồn |

Các nhãn chưa giải nghĩa chắc chắn từ file:

| Nhãn nguyên văn | Cách xử lý |
| --- | --- |
| Mi-anpha protein | Có khả năng thiếu/sai ký tự, chưa đủ căn cứ để đổi thành Mi-2 alpha |
| TIFI-gamma | Cần đối chiếu tên chính xác trên bộ kit/phiếu gốc trước khi chuẩn hóa |
| RP11 / RP155 | Cần đối chiếu tên đích trên bộ kit; giữ nguyên nhãn trong khi chờ xác nhận |

Tên một kháng thể hoặc kết quả dương tính không tự tạo thành chẩn đoán. Các ngưỡng và điều kiện sử dụng phải được xem theo phương pháp và bối cảnh.

## 10. Thăm dò, hình ảnh và chức năng hô hấp

| Ký hiệu | Giải nghĩa |
| --- | --- |
| ECG / EKG | Electrocardiogram: điện tâm đồ |
| EMG | Electromyography: điện cơ |
| MRI | Magnetic Resonance Imaging: chụp cộng hưởng từ |
| CT | Computed Tomography: chụp cắt lớp vi tính |
| HRCT | High-Resolution Computed Tomography: chụp CT độ phân giải cao |
| PFT | Pulmonary Function Tests: các thăm dò chức năng hô hấp |
| VC | Vital Capacity: dung tích sống |
| FVC | Forced Vital Capacity: dung tích sống gắng sức |
| FEV1 | Forced Expiratory Volume in 1 second: thể tích thở ra gắng sức trong giây đầu |
| FEV1/VC | Tỷ số FEV1 trên VC |
| FEV1/FVC | Tỷ số FEV1 trên FVC |
| TLC | Total Lung Capacity: tổng dung tích phổi |
| RV | Residual Volume: thể tích khí cặn |
| RV/TLC | Tỷ số thể tích khí cặn trên tổng dung tích phổi |
| VA | Alveolar Volume: thể tích phế nang được xác định trong phép đo liên quan |
| DLCO / TLCO | Khả năng khuếch tán/hệ số chuyển khí CO của phổi; đơn vị tùy hệ đo |
| KCO / Kco | Hệ số chuyển khí CO trên một đơn vị thể tích phế nang trong phép đo tương ứng |
| Hb trong “DLCO Hb”, “Kco Hb” | Có đề cập hemoglobin; cần xác nhận báo cáo đã hiệu chỉnh Hb hay biểu thị gì cụ thể |
| % predicted | Phần trăm so với giá trị dự đoán theo phương trình tham chiếu |
| z-score | Độ lệch của kết quả so với phân bố tham chiếu, biểu thị theo độ lệch chuẩn |
| ILD | Interstitial Lung Disease: bệnh phổi mô kẽ |
| UIP | Usual Interstitial Pneumonia: kiểu viêm phổi mô kẽ thông thường |
| NSIP | Nonspecific Interstitial Pneumonia: kiểu viêm phổi mô kẽ không đặc hiệu |
| OP | Organizing Pneumonia: kiểu viêm phổi tổ chức hóa |
| NSIP-OP overlap | Kiểu chồng lấp NSIP và OP |
| DAD | Diffuse Alveolar Damage: tổn thương phế nang lan tỏa |
| LIP | Lymphocytic Interstitial Pneumonia: kiểu viêm phổi mô kẽ lympho |
| Unclassifiable pattern | Kiểu chưa thể phân loại theo các nhóm đang dùng |

Các tên kiểu tổn thương không tự thay thế chẩn đoán nguyên nhân. Giá trị tuyệt đối, tỷ số và % dự đoán cần được lưu như các thuộc tính khác nhau.

## 11. Một số ký hiệu chuyên môn khác

| Ký hiệu | Giải nghĩa |
| --- | --- |
| GI | Gastrointestinal: tiêu hóa; cũng được dùng làm tiền tố mã nhóm trong danh mục |
| IBD | Inflammatory Bowel Disease: bệnh viêm ruột |
| UC | Ulcerative Colitis: viêm loét đại tràng |
| Crohn | Bệnh Crohn, một nhóm bệnh trong IBD |
| GERD | Gastroesophageal Reflux Disease: bệnh trào ngược dạ dày–thực quản |
| Class I–VI | Các class I đến VI của phân loại viêm thận lupus được nêu trong nguồn; không phải mức nặng tuyến tính để tự suy diễn |
| IIIA / IVA | Nhãn class III/IV kèm A; A thường chỉ tổn thương hoạt động trong hệ phân loại tương ứng |
| IIIC / IVC | Nhãn class III/IV kèm C; C thường chỉ tổn thương mạn tính trong hệ phân loại tương ứng |
| IIIA/C / IVA/C | Nhãn class III/IV kèm cả A và C; cần giữ hệ phân loại và phiên bản báo cáo |

Ý nghĩa chi tiết của class và hậu tố cần được bác sĩ xác nhận theo báo cáo sinh thiết và hệ phân loại được sử dụng.

## 12. Đơn vị và cách biểu thị

| Ký hiệu | Giải nghĩa |
| --- | --- |
| cm / m / m² | Centimét / mét / mét vuông |
| kg / g / mg / µg | Kilôgam / gam / miligam / microgam |
| L / dL / mL / µL | Lít / đềxilít / mililít / microlít |
| g/L / g/dL | Gam trên lít / gam trên đềxilít; hai đơn vị khác nhau |
| T/L | Tera trên lít, tương đương 10^12 trên lít trong cách ghi số lượng tế bào |
| 10^9/L | Một tỷ trên lít, thường dùng cho số lượng bạch cầu hoặc tiểu cầu |
| °C | Độ Celsius, đơn vị nhiệt độ |
| % | Phần trăm; cần xác định phần trăm của đại lượng nào |
| g/24h | Gam thu được trong 24 giờ |
| mL/min/1.73 m² | Mililít mỗi phút, chuẩn hóa theo diện tích cơ thể 1,73 m² |
| mmHg | Milimét thủy ngân, đơn vị áp suất |
| /100 | Thang điểm có mẫu số hoặc mức tối đa 100 theo biểu mẫu |
| 1:160 | Ví dụ hiệu giá pha loãng; không phải nồng độ hay tỷ số hai chất |
| mL/mmHg/Mi | Chuỗi đơn vị Kco ghi trong CRF; đoạn “Mi” chưa rõ và cần xác nhận, không tự coi là đơn vị đã chuẩn hóa |

Các đơn vị như mg/dL, µmol/L, U/L hoặc IU/mL có thể xuất hiện trong hồ sơ thực tế. Cần giữ đơn vị gốc và chỉ chuyển đổi khi đã xác định đại lượng, phương pháp và quy tắc phù hợp.

## 13. Thuật ngữ kỹ thuật trong kế hoạch

| Thuật ngữ | Cách hiểu |
| --- | --- |
| Registry | Hệ thống đăng ký, tích lũy và quản lý dữ liệu của một nhóm bệnh nhân theo mục tiêu xác định |
| CURE | Chronic Urticaria Registry: registry mày đay được dùng làm mô hình tham khảo cho dự án |
| Baseline / BL | Lần thu thập thông tin ban đầu theo đề cương; có thể bao gồm dữ liệu bệnh sử trước khi tham gia registry |
| Follow-up / FUP | Lần thu thập thông tin theo dõi tiếp theo |
| REDCap | Research Electronic Data Capture: nền tảng thu thập/quản lý dữ liệu nghiên cứu được CURE sử dụng cho luồng trực tuyến |
| secuTrial | Tên nền tảng được CURE công bố cho luồng thu thập cổ điển |
| QR code | Mã hai chiều có thể chứa đường dẫn hoặc mã; cần xác định nội dung và phạm vi truy cập |
| HIS / LIS | Hospital Information System / Laboratory Information System: hệ thống thông tin bệnh viện / xét nghiệm; HIS trong ngữ cảnh này khác tiền tố HIS của danh mục tiền sử |
| API | Application Programming Interface: giao diện để các hệ thống trao đổi dữ liệu theo chức năng và quyền được cấp |
| Pool data | Kho dữ liệu tích lũy; cần cấu trúc, nguồn và quy tắc chất lượng để sử dụng được |
| OCR | Optical Character Recognition: nhận dạng chữ trong ảnh hoặc bản quét |
| AI | Artificial Intelligence: trí tuệ nhân tạo |
| PDF / DOCX / MD | Định dạng tài liệu PDF / Word / Markdown |
| OOXML | Office Open XML: cấu trúc file được dùng trong DOCX |
| XML | Định dạng biểu diễn dữ liệu có cấu trúc bằng thẻ |
| Schema | Cấu trúc tổ chức dữ liệu: các trường, kiểu và quan hệ |
| SQL | Ngôn ngữ truy vấn thường dùng với cơ sở dữ liệu quan hệ |
| PostgreSQL | Một hệ quản trị cơ sở dữ liệu quan hệ được đề xuất trong kế hoạch |
| Object storage | Kho lưu trữ đối tượng, phù hợp lưu file ảnh, PDF và tài liệu gốc |
| Queue / hàng đợi | Cơ chế xếp công việc chờ xử lý, ví dụ các file chờ OCR |
| Worker / tiến trình nền | Thành phần lấy công việc từ hàng đợi để xử lý |
| Pilot | Đợt triển khai thử có giới hạn để đo chất lượng và khả năng vận hành |
| Histogram | Biểu đồ phân bố tần suất theo các khoảng giá trị |
| Panel | Một nhóm xét nghiệm gồm nhiều thành phần trong một lần làm |
| Encounter | Một lần hoặc đợt tiếp xúc khám/chăm sóc y tế |
| Observation | Bản ghi một kết quả xét nghiệm, phép đo hoặc quan sát có ngữ cảnh |
| Evidence / provenance | Bằng chứng và nguồn gốc của dữ liệu |
| Mapping / ánh xạ | Liên kết nhãn gốc với khái niệm chuẩn trong từ điển |
| Enum | Danh sách giá trị cho phép được định nghĩa trước |
| Boolean | Kiểu logic hai giá trị; riêng dữ liệu lâm sàng thường còn cần trạng thái chưa rõ/thiếu |
| Version / phiên bản | Mốc thay đổi của từ điển, dữ liệu, công cụ hoặc quy tắc |
| Audit log | Nhật ký ai đã truy cập hoặc thực hiện hành động, vào lúc nào |
| Microservices | Cách chia hệ thống thành nhiều dịch vụ có thể triển khai riêng |

## 14. Ví dụ phân biệt mã và kết quả

`IMM11 = C3, kiểu LAB` chỉ cho biết đây là mục xét nghiệm C3. Nó chưa cho biết bệnh nhân có C3 thấp hay cao. Muốn đánh giá cần giá trị, đơn vị, khoảng tham chiếu phù hợp, ngày và nguồn.

`SDA20 = Low Complement, điểm nguồn 2` là một mục trong thang điểm, không phải cùng một bản ghi với xét nghiệm C3. Nó cần liên kết tới bằng chứng và được đánh giá theo quy tắc của thang điểm.

`B77 R12` chỉ vị trí hàng C3 trong bảng nguồn, không phải mã xét nghiệm và không phải số trang.
