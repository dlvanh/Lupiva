# Nguồn và dữ kiện cho kho kiến thức CRF Lupiva

Phiên bản `crf-clinical-evidence-2` lưu 14 mục EULAR/ACR 2019 và SLEDAI-2K trong SQLite. Mỗi mục có mã CRF, định nghĩa, trường dữ liệu cần tra, nguồn và vị trí trong nguồn. Những mục còn cần quy kết hoặc loại trừ có hướng dẫn xác nhận riêng.

| Phạm vi | Dữ kiện cần lưu | Nguồn |
|---|---|---|
| EULAR/ACR 2019, EAC01–EAC22 | Định nghĩa, nhóm, trọng số, điều kiện ANA và quy kết nguyên nhân. Lưu hiệu giá, phương pháp và ngày ANA. Khi tính, lấy điểm cao nhất mỗi nhóm, kiểm tra có tiêu chí lâm sàng và ngưỡng phân loại. | [Aringer và cộng sự](https://acrjournals.onlinelibrary.wiley.com/doi/10.1002/art.40930) |
| SLEDAI-2K, SDA01–SDA25 | Định nghĩa, trọng số, dấu hiệu loại trừ, ngày đánh giá và ngày xuất hiện hoặc lấy mẫu. Ghi phiên bản 10 ngày đang dùng. Các biểu hiện dai dẳng có thể đủ điều kiện ở những mục được định nghĩa như vậy. | [Gladman và cộng sự](https://pubmed.ncbi.nlm.nih.gov/11838846/), [Touma và cộng sự](https://pubmed.ncbi.nlm.nih.gov/19910390/) |
| Khoảng tham chiếu | Xét nghiệm, đơn vị, cận dưới/trên, dấu so sánh, phương pháp và phạm vi áp dụng đã xác nhận. Giữ nguyên khoảng in trên phiếu và nguồn của khoảng dùng để đối chiếu. | [CLSI EP28](https://clsi.org/shop/standards/ep28/) |
| Ký hiệu định tính | Giá trị gốc, tên cột, panel, phiên bản mẫu và chú giải nguồn. Chỉ diễn giải ký hiệu theo chú giải áp dụng cho đúng phiếu. | Chú giải của phiếu hoặc tài liệu kỹ thuật của bộ xét nghiệm tương ứng |

## Các mục ưu tiên

- **EAC19, EAC20, SDA20**. Giữ số đo C3/C4, đơn vị, khoảng tham chiếu và ngày. EAC20 cần bằng chứng cả hai cùng thấp. SLEDAI-2K còn có CH50 trong định nghĩa giảm bổ thể. Lupiva hiện chỉ gợi ý từ C3/C4, nên CH50 cần ánh xạ riêng nếu bổ sung.
- **EAC15, SDA13**. Nhận protein niệu trên 0,5 g/24 giờ hoặc UPCR trên 500 mg/g, tương đương trên 0,5 g/g hay 0,5 mg/mg. Nồng độ g/L và dấu cộng trên que thử cần đánh giá riêng. SLEDAI-2K còn cần ngày nguồn và xác nhận protein niệu do viêm thận lupus đang hoạt động. [EULAR/ACR, Bảng 1](https://acrjournals.onlinelibrary.wiley.com/doi/10.1002/art.40930) · [SLEDAI-2K, Phụ lục 10](https://cdn.clinicaltrials.gov/large-docs/00/NCT02908100/Prot_SAP_000.pdf#page=177) · [KDIGO 2024, Hình 1](https://kdigo.org/wp-content/uploads/2024/01/KDIGO-2024-Lupus-Nephritis-Guideline.pdf)
- **SDA12, SDA14**. Nhận hồng cầu hoặc bạch cầu niệu trên 5 tế bào/HPF trong cửa sổ đánh giá. Đối chiếu cách lấy mẫu và nguyên nhân thay thế trước khi chọn. Kết quả định tính, que thử và đơn vị theo µL cần đánh giá riêng. [SLEDAI-2K, Phụ lục 10](https://cdn.clinicaltrials.gov/large-docs/00/NCT02908100/Prot_SAP_000.pdf#page=177)
- **EAC12**. Có thể đề xuất từ `CV06` dương tính đọc trực tiếp trong mục màng ngoài tim của phiếu siêu âm. Chẩn đoán viêm màng ngoài tim cấp cần các dấu hiệu riêng theo tiêu chí EAC13. [EULAR/ACR, Bảng 1](https://acrjournals.onlinelibrary.wiley.com/doi/10.1002/art.40930)
- **EAC18**. Nhận aCL IgG trên 40 GPL hoặc aCL IgM trên 40 MPL, hay kết luận dương tính in rõ cho anti-β₂GPI IgG/IgM. Bách phân vị 99 và lupus anticoagulant cần dữ liệu phương pháp và kết luận xét nghiệm tương ứng trước khi mã hóa thêm. [EULAR/ACR, Bảng 1](https://acrjournals.onlinelibrary.wiley.com/doi/10.1002/art.40930)
- **EAC21, SDA21**. EAC21 dùng Anti-Sm riêng ghi rõ dương tính. Anti-dsDNA cần bằng chứng phương pháp phù hợp với từng thang điểm. Với EULAR/ACR cần xác minh độ đặc hiệu tối thiểu 90% với nhóm chứng bệnh phù hợp. Mẫu SLEDAI-2K của dự án nêu Farr assay. [EULAR/ACR, Bảng 1](https://acrjournals.onlinelibrary.wiley.com/doi/10.1002/art.40930) · [SLEDAI-2K, Phụ lục 10](https://cdn.clinicaltrials.gov/large-docs/00/NCT02908100/Prot_SAP_000.pdf#page=180)
- **EAC02, EAC03, SDA23, SDA24**. Lưu trị số, đơn vị, ngày và điều kiện loại trừ cho từng bảng. Cùng một kết quả công thức máu có thể thỏa ngưỡng của bảng này nhưng không thỏa bảng kia.
- **Các mục lâm sàng**. Lưu bằng chứng trực tiếp, mốc thời gian, nguyên nhân thay thế và xác nhận của người duyệt. Khi tài liệu thiếu thông tin hoặc mâu thuẫn, lưu trạng thái chưa rõ.

## Tra cứu và chọn trên CRF

### Các ô ngoài phần chấm điểm

Kho `crf-form-findings-1` dùng các dữ kiện đã đọc trong hồ sơ để hỗ trợ các ô da/niêm mạc, tim mạch, phổi, thần kinh, tiêu hóa và sinh thiết thận. Ví dụ, kết luận có dịch màng ngoài tim trên phiếu siêu âm hỗ trợ ô bất thường tim mạch. Phân lớp viêm thận lupus được ghi rõ trong mục mô bệnh học hỗ trợ ô đã sinh thiết. Các đề xuất xuất hiện ngay tại ô liên quan cùng ảnh nguồn. Khi chọn đề xuất, phiếu đã duyệt lưu căn cứ và phiên bản quy tắc.

Các mục tổn thương thận, tổn thương cơ và rối loạn huyết học có hướng dẫn đối chiếu. Kết quả đơn lẻ như eGFR, CK hoặc công thức máu chỉ là dữ kiện hỗ trợ. Tiền sử, điều trị và các mục còn lại cần thông tin được ghi nhận trong hồ sơ hoặc đánh giá của người duyệt. [KDIGO 2024 về viêm thận lupus](https://kdigo.org/wp-content/uploads/2024/01/KDIGO-2024-Lupus-Nephritis-Guideline.pdf) · [KDIGO 2024 về bệnh thận mạn](https://doi.org/10.1016/j.kint.2023.10.016)

### Kho phát hiện từ xét nghiệm `crf-lab-findings-1`

Kho thứ ba suy ra các ô định tính ngay từ trị số xét nghiệm đã đọc, chạy cục bộ mỗi lần dựng khung nhìn CRF. Mỗi mục gồm ô đích, danh sách tiêu chí (bất kỳ tiêu chí nào đạt cũng đề xuất), định nghĩa, lời xác nhận, chuẩn và nguồn. Nguyên tắc bắt buộc: chỉ đề xuất `yes`, không bao giờ đề xuất `no` hay coi thiếu dữ liệu là âm tính; mọi đề xuất đều cần bác sĩ xác nhận (`requires_confirmation=True`) kèm lời xác nhận tiếng Việt, giữ bằng chứng `sources`, `reason`, `knowledge_version` và `source_url`; ô đã có giá trị đọc trực tiếp không bị ghi đè. Chỉ dùng nguồn hiện hành vượt qua cùng bộ bảo vệ như `matches_rule` (không mâu thuẫn, không chờ sửa, không blocker, không thiếu/chưa đọc) và dấu so sánh None hoặc '='. Khác đơn vị thì quy đổi hoặc bỏ qua, không so sánh đơn vị không tương thích.

| Ô đích | Tiêu chí (bất kỳ) | Nguồn |
|---|---|---|
| HEM12 (kèm ô chi tiết) | HEM02 Hb <120 g/L (đổi g/dL ×10); HEM05 WBC <4,0 ×10⁹/L; HEM07 `absolute_count` <1,0 ×10⁹/L; HEM11 PLT <100 ×10⁹/L; HEM13 Coombs trực tiếp dương tính rõ | [WHO 2011](https://www.who.int/publications/i/item/WHO-NMH-NHD-MNM-11.1) · [EULAR/ACR 2019](https://acrjournals.onlinelibrary.wiley.com/doi/10.1002/art.40930) · [SLICC 2012](https://pubmed.ncbi.nlm.nih.gov/22553077/) |
| REN07 | REN08 >0,5 g/24h hoặc 500 mg/24h; REN01 theo `PROTEIN_LIMITS`; REN02 >5 RBC/HPF; REN06 eGFR <60 mL/min/1.73m²; REN05 creatinine trên cận trên khoảng tham chiếu in trên phiếu | [KDIGO 2024 LN](https://kdigo.org/wp-content/uploads/2024/01/KDIGO-2024-Lupus-Nephritis-Guideline.pdf) · [KDIGO 2024 CKD](https://doi.org/10.1016/j.kint.2023.10.016) |
| MUS02 | MUS01 CK trên cận trên khoảng tham chiếu in trên phiếu | [SLEDAI-2K](https://cdn.clinicaltrials.gov/large-docs/00/NCT02908100/Prot_SAP_000.pdf) |
| LUNG01 | PFT11 DLCO `pre_percent_predicted` <80; PFT02 FVC `pre_percent_predicted` <80; IMM18 KL-6 >500 U/mL | [ATS/ERS 2022](https://doi.org/10.1183/13993003.01499-2021) · [KL-6](https://pubmed.ncbi.nlm.nih.gov/16371657/) |
| EAC21 | IMM04 anti-dsDNA trên cận trên khoảng tham chiếu hoặc dương tính rõ; ANA01 dsDNA (line blot) dương tính rõ | [EULAR/ACR 2019](https://acrjournals.onlinelibrary.wiley.com/doi/10.1002/art.40930) |
| SDA21 | IMM04 trên cận trên khoảng tham chiếu (cửa sổ 10 ngày) | [SLEDAI-2K](https://cdn.clinicaltrials.gov/large-docs/00/NCT02908100/Prot_SAP_000.pdf) |
| EAC04 | HEM13 Coombs trực tiếp dương tính rõ | [EULAR/ACR 2019](https://acrjournals.onlinelibrary.wiley.com/doi/10.1002/art.40930) |
| EAC01 | HIS12 thân nhiệt >38,3 °C | [EULAR/ACR 2019](https://acrjournals.onlinelibrary.wiley.com/doi/10.1002/art.40930) |
| SDA22 | HIS12 >38 °C (cửa sổ 10 ngày) | [SLEDAI-2K](https://cdn.clinicaltrials.gov/large-docs/00/NCT02908100/Prot_SAP_000.pdf) |
| HIS11 | HIS12 ≥38 °C | Mẫu CRF Lupiva |

Ô chi tiết của HEM12 ghép các phát hiện đạt bằng "; ", ví dụ "Thiếu máu (Hb 110 g/L); Giảm tiểu cầu (PLT 90 10⁹/L)"; số in đúng như giá trị lưu, không làm tròn. "Trên cận trên khoảng tham chiếu" đọc khoảng in `reference_range_raw` hoặc khoảng đã xác nhận trong `references`, nhận dạng `A – B` (cận trên B) và `< X` / `<= X` (cận trên X); bỏ qua khi thiếu hoặc không đọc được. "Dương tính rõ" dùng giá trị định tính trong tập `EXPLICIT_POSITIVE` kèm kiểm tra văn bản gốc như quy tắc `anti_smith`. Các tiêu chí xét nghiệm của EAC21/SDA21 không thêm vào `RULES`; bộ chấm điểm giữ định nghĩa riêng. Đề xuất cho ô điểm (EAC*, SDA*) hiện ở đúng ô đó như bằng chứng điểm hiện có (qua bản xem trước điểm), và chỉ vào phiếu đã duyệt khi người duyệt chọn tiêu chí; `evaluate_scores` không thay đổi.

 Khi dựng bản nháp LLM, ô chỉ bị loại khỏi yêu cầu nếu đã có đề xuất cục bộ; mọi ô còn gửi kèm `criteria` là định nghĩa và lời xác nhận của các quy tắc nhắm vào ô đó (RULES, FORM_FINDINGS, LAB_FINDINGS). `PROMPT_VERSION` là `crf-suggestions-3`. Báo cáo phủ (`scripts/crf_coverage.py`) đếm đề xuất phát hiện từ xét nghiệm là `suggested` và liệt kê đầu vào còn thiếu của quy tắc bị chặn.

### Các tiêu chí chấm điểm

Trong **Chấm điểm EULAR/ACR 2019 và SLEDAI-2K**, mở **Tiêu chí và nguồn** ở từng mục để tra lại quy tắc. Bấm **Tính điểm nháp** để so dữ liệu của hồ sơ với quy tắc và mở ảnh nguồn. Với các mục cần quy kết hoặc loại trừ, đọc điều kiện rồi bấm **Xác nhận và chọn Có**. Chức năng điền theo nhóm dùng cho các mục còn trống có đủ dữ liệu mà không cần bước xác nhận riêng. **Duyệt phiếu CRF** lưu kết quả cuối cùng.

`GET /api/crf/knowledge` trả bộ quy tắc hiện hành, SHA-256 và danh sách phiên bản đã lưu. `GET /api/crf/knowledge?version=crf-clinical-evidence-1` đọc lại phiên bản 1 trong cơ sở dữ liệu từng cài phiên bản đó. Kho quy tắc không chứa dữ liệu bệnh nhân. Bản CRF đã duyệt lưu phiên bản, lý do và bằng chứng của mục đã chọn. Khi chưa đủ dữ kiện, mục tương ứng để trống để người duyệt đánh giá.

## Quy tắc đã nối với CRF

SQLite lưu bộ quy tắc có phiên bản và hàm băm trong bảng `crf_knowledge`. Lupiva đọc bộ này khi tạo đề xuất điểm. C3/C4 có thể nhận khoảng tham chiếu trực tiếp từ OCR cục bộ nếu cột kết quả, đơn vị và khoảng tham chiếu khớp duy nhất với dòng đã đọc. Khoảng tham chiếu đã xác nhận tiếp tục dùng cơ chế trong `registry_review/references.py`.

Đề xuất bạch cầu và tiểu cầu ghi bằng chứng, nguồn và điều kiện loại trừ. EULAR/ACR dùng bạch cầu dưới 4 × 10⁹/L và tiểu cầu dưới 100 × 10⁹/L. SLEDAI-2K dùng bạch cầu dưới 3 × 10⁹/L và tiểu cầu dưới 100 × 10⁹/L trong cửa sổ 10 ngày. Lupiva hiển thị số đo đủ ngưỡng và để bác sĩ chọn Có sau khi kiểm tra nguyên nhân khác hoặc nguyên nhân do thuốc. [Bảng 1 EULAR/ACR](https://acrjournals.onlinelibrary.wiley.com/doi/full/10.1002/art.40930), [Định nghĩa SLEDAI-2K trong đề cương nghiên cứu](https://cdn.clinicaltrials.gov/large-docs/00/NCT02908100/Prot_SAP_000.pdf)
