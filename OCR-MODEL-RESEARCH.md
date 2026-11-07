# Nghiên cứu model OCR cho ảnh hồ sơ lupus

Ngày tra cứu: **05/11/2026**. Chỉ xét phương án inference nội bộ. Server có NVIDIA GPU; tạm hiểu câu trả lời “4–8” là **4–8 GB VRAM**, chưa xác định model GPU, driver và VRAM thực. Chưa tải weights, cài hoặc benchmark model trên hồ sơ.

## 1. Đề xuất sau nghiên cứu

**Không khóa lựa chọn ở PP-OCRv5. Ưu tiên benchmark PaddleOCR-VL-1.6 và MonkeyOCRv2-B-Parsing; dùng PP-OCRv5 tiếng Việt làm mốc, thêm SenOCR-Vi để kiểm tra phần chữ tiếng Việt.** Đây là thứ tự thử dựa trên tài liệu và đặc điểm input, chưa phải xếp hạng độ chính xác đã đo.

Nếu chỉ chọn một hướng để làm POC trước: **PaddleOCR-VL-1.6**, vì cần đọc cả bảng và cấu trúc trang. Chạy đối chứng **MonkeyOCRv2-B-Parsing** trước khi quyết định engine chính. Không quyết định theo ngày ra mắt hoặc điểm benchmark tổng quát.

Hai model mới, nhỏ đáng để ở vòng kế tiếp: **Nemotron-3.5-Parse** và **LightOnOCR-3-0.8B**. Chưa nên triển khai cả năm model trong pipeline thường trực trên GPU 4–8 GB.

## 2. Input của dự án đòi hỏi gì

Đã xem lại contact sheet của 12 ảnh input, đối chiếu kết quả phân tích trước. Không gửi ảnh, crop hoặc nội dung bệnh nhân ra trang demo/API để nghiên cứu.

| Nhóm ảnh | Đặc điểm nhìn thấy | Khả năng phải kiểm tra |
| --- | --- | --- |
| IN01, IN10, IN11 | Phiếu xét nghiệm, chữ nhỏ, nhiều cột số, có ghi chú viết tay; ảnh điện thoại có nghiêng và ánh sáng không đều | Ghép đúng tên–kết quả–đơn vị, tránh nhầm cột tham chiếu; đọc dấu thập phân, dấu so sánh và số tuyệt đối/% |
| IN04, IN06 | Panel kháng thể thành nhiều dòng | Không lệch hàng; giữ định tính và intensity, đúng tên kháng thể/panel |
| IN08, IN09 | Báo cáo panel có bảng và thanh màu | Lấy số/nhãn được in; không ước lượng từ độ dài thanh màu |
| IN02 | PFT có nhiều cột và ghi chú viết tay | Tách measured/% predicted/pre/post; giữ đúng hàng và đơn vị |
| IN03 | Đồ thị PFT | Không tự suy giá trị xét nghiệm từ đường cong khi chưa có quy trình đọc đồ thị; ưu tiên các số ghi rõ ở phiếu |
| IN05, IN07 | Phần ký/kết thúc phiếu | Không xem chữ ký, mã tài liệu hoặc nhãn in sẵn là xét nghiệm mới |
| IN12 | Bảng có nội dung viết tay, ngoài bộ trường Word hiện tại | Đọc để lưu nguồn/chưa ánh xạ; không tự thêm trường vào Word lupus |

Các ghi chú hướng dẫn vị trí điền không mặc định là triệu chứng hay kết luận bệnh nhân. Không dùng ảnh output làm bằng chứng bổ sung. Word đã được lọc ngoài lupus là chuẩn xác định trường nghiệp vụ của pool; bố cục Word thuộc hệ thống xuất phía sau.

## 3. Model đáng thử, theo thứ tự

Quy mô tham số là thông tin mô hình từ nhà phát hành; **không phải mức VRAM inference**. Nhận định “phù hợp” bên dưới là suy luận kỹ thuật của dự án.

| Ưu tiên | Model | Căn cứ từ nguồn chính thức | Đánh giá cho input này |
| --- | --- | --- | --- |
| **A1** | **PaddleOCR-VL-1.6**, khoảng 0.9B | Phát hành 28/05/2026; Apache-2.0; document parser cho text/bảng, có cải tiến vùng khó. [Model card](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6), [technical report](https://arxiv.org/abs/2606.03264) | Ưu tiên thử toàn trang và vùng bảng. Kiểm kỹ số nhỏ, nhầm hàng và mức tọa độ có thể trả về; không coi output Markdown là đã ánh xạ CRF. |
| **A2** | **MonkeyOCRv2-B-Parsing**, 0.7B | Ra mắt dòng v2 ngày 14/07/2026; Apache-2.0; công bố hỗ trợ 17 ngôn ngữ gồm Việt và ảnh tài liệu chụp. [Repo](https://github.com/Yuliang-Liu/MonkeyOCRv2), [checkpoint parsing](https://huggingface.co/zenosai/MonkeyOCRv2-B-Parsing) | Đối chứng quan trọng cho A1 trên ảnh điện thoại. Tải đúng checkpoint Parsing; vision encoder `MonkeyOCRv2-B` riêng không phải hệ OCR hoàn chỉnh. |
| **A3** | **SenOCR-Vi**, khoảng 0.959B | Fine-tune từ PaddleOCR-VL-1.6 cho Việt; Apache-2.0. Card nêu hạn chế bảng phức tạp và benchmark được xác nhận ở FP32. Chưa xác minh ngày phát hành cụ thể. [Model card](https://huggingface.co/VietAlphaLabs/SenOCR-Vi) | Thử chữ Việt/ghi chú trên crop. Không chọn thay toàn bộ engine bảng chỉ vì chuyên tiếng Việt. Chưa có số VRAM/latency được đo cho server này. |
| **B1** | **NVIDIA Nemotron-3.5-Parse**, khoảng 0.631B | Công bố tháng 10/2026; có text, lớp bố cục và bbox; OpenMDW-1.1. Hai trang hãng ghi mốc HF 17/10 và 20/10 khác nhau. [Model card HF](https://huggingface.co/nvidia/Nemotron-3.5-Parse), [NVIDIA card](https://build.nvidia.com/nvidia/nemotron-3.5-parse/modelcard) | Đáng thử vì nhỏ và có grounding. Benchmark đa ngữ công bố chưa chứng minh đọc đúng phiếu y tế Việt; đo bảng/số và GPU nhỏ trước khi xếp cao hơn. |
| **B2** | **LightOnOCR-3-0.8B** | Dòng v3 công bố 08/10/2026; Apache-2.0; có mode chép chữ và mode `grounding` trả vùng/bbox. [Công bố](https://huggingface.co/blog/lightonai/lightonocr-3), [model card](https://huggingface.co/lightonai/LightOnOCR-3-0.8B) | Nhỏ, mới, có vị trí để kiểm nguồn; tài liệu đọc chưa xác lập chất lượng riêng cho Việt. Chỉ dùng prompt đúng chế độ model hỗ trợ. |
| **Mốc đối chứng** | **PP-OCRv5 detector + Latin recognizer tiếng Việt + PP-StructureV3** | Pipeline mô-đun có thể giữ tọa độ chi tiết. [OCR models](https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html), [PP-StructureV3](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/PP-StructureV3.en.md) | Giữ làm mốc nhanh, dễ đối chiếu chữ và cell. Không mặc định VLM mới luôn đọc số tốt hơn OCR theo dòng. |

### Vì sao thay đổi đề xuất PP-OCRv5 ban đầu

Đề xuất trước dùng v5 làm cấu hình khởi đầu. Sau tra cứu, đã có các model parser mới đáng so sánh trực tiếp. Cần đánh giá VLM đọc bảng/trang bên cạnh OCR mô-đun để tránh quyết định công cụ quá sớm.

Model parser chuyển ảnh thành nội dung có cấu trúc. Để tạo pool cần bộ trích, phân loại vào trường nghiệp vụ theo panel/phương pháp/ngày và kiểm nguồn riêng. OCR không trực tiếp điền Word; hệ thống lưu trữ phía sau có thể tạo Word từ pool.

## 4. Các model mới khác và lý do chưa ưu tiên

| Model | Phát hiện từ nguồn | Quyết định cho GPU 4–8 GB và phiếu tiếng Việt |
| --- | --- | --- |
| **PP-OCRv6** | Phát hành 11/06/2026, có nhiều cỡ. Nhưng [issue #18254](https://github.com/PaddlePaddle/PaddleOCR/issues/18254) ghi thiếu ký tự dấu Việt trong dict; maintainer xác nhận cần xử lý ở model, không chỉ thay dict. Issue đã đóng, chưa tìm thấy bằng chứng đủ để kết luận checkpoint đang xét đã khắc phục. | Không tự chọn `lang=vi`/mặc định latest rồi coi đạt. Kiểm charset/checkpoint cụ thể trước; giữ v5 Latin làm mốc. Có thể thử detector v6 riêng, nhưng không tự đổi dict recognizer. |
| **GLM-OCR**, 0.9B | MIT; hỗ trợ bảng và trích có cấu trúc, nhưng [model card](https://huggingface.co/zai-org/GLM-OCR/raw/main/README.md) liệt kê 8 ngôn ngữ, không có Việt. | Có thể thử đối chứng sau. Thiếu Việt trong card không chứng minh model không đọc được; cũng chưa đủ căn cứ ưu tiên cho toàn bộ hồ sơ Việt. |
| **Surya 2.5**, 689M | [Repo hiện hành](https://github.com/datalab-to/surya) có OCR/layout/bảng; weights dùng license riêng có điều kiện. Bản 2.5 đọc bảng thành HTML nhưng không trả hình học hàng/cột như checkpoint Surya 2. | Nhỏ và đáng quan tâm; chưa vào vòng đầu vì cần nguồn chính xác theo cell và rà điều kiện weights. Code Apache không đồng nghĩa weights Apache. |
| **Chandra OCR 2** | [Model card](https://huggingface.co/datalab-to/chandra-ocr-2) nêu bảng/form/viết tay/90+ ngôn ngữ; weights dùng modified OpenRAIL-M, khác license code. | Có thể là đối chứng chất lượng khi có tài nguyên và quyền sử dụng phù hợp. Chưa ưu tiên cấu hình GPU ít VRAM; không mặc định chạy BF16 đầy đủ trong 4 GB. |
| **HunyuanOCR-1.5** | Phát hành 07/07/2026; có inference local, context/ảnh lớn; Tencent Hunyuan Community License. [Repo](https://github.com/Tencent-Hunyuan/HunyuanOCR), [card](https://huggingface.co/tencent/HunyuanOCR) | Đưa vòng sau, cần kiểm tiếng Việt và điều kiện license. Không lấy throughput server lớn làm tốc độ dự kiến trên GPU nhỏ. |
| **DeepSeek-OCR-2** | [Repo](https://github.com/deepseek-ai/DeepSeek-OCR-2), [card](https://huggingface.co/deepseek-ai/DeepSeek-OCR-2) có inference NVIDIA, dynamic crop và license Apache-2.0. | Chưa thấy bằng chứng riêng đủ mạnh về phiếu y tế Việt để thay các model nhỏ có hỗ trợ Việt rõ hơn. |
| **dots.mocr** | Dòng dots.ocr-1.5 được đổi tên thành dots.mocr ngày 19/03/2026. [Repo công bố](https://github.com/studio-dots-ai/dots.ocr), [checkpoint](https://huggingface.co/dots-studio/dots.mocr) | Tránh tải theo đường dẫn rednote-hilab cũ hoặc bản re-upload không rõ nguồn. Để vòng sau; tính năng SVG/đồ họa không phải ưu tiên của CRF này. |
| **Unlimited-OCR-2** | Phát hành 27/10/2026, MIT, tập trung đọc tài liệu rất dài với attention có cửa sổ; [model card](https://huggingface.co/baidu/Unlimited-OCR-2). | Mới nhưng bài toán hiện tại là ảnh phiếu ngắn. Chưa có căn cứ ưu tiên lợi thế tài liệu hàng trăm trang cho bộ input này. |

Không so trực tiếp các con số OmniDocBench v1.5/v1.6, olmOCR-bench, ParseBench và MDPBench như cùng một thước đo. Bản công bố/model card thường là kết quả nhà phát hành, không phải phép thử độc lập trên dữ liệu của dự án.

[MDPBench](https://github.com/Yuliang-Liu/MultimodalOCR/blob/main/MDPBench/README.md) đáng tham khảo vì có ảnh tài liệu chụp và tiếng Việt. Dù vậy, kết quả trên benchmark này chưa thay thế kiểm đúng trường xét nghiệm.

## 5. Cấu hình thử theo VRAM

Đây là cấu hình thử đề xuất, chưa phải yêu cầu tối thiểu được xác nhận cho từng model.

| VRAM thực | Cách bắt đầu |
| --- | --- |
| **4 GB** | Chạy OCR mô-đun làm mốc; layout trên CPU nếu phù hợp. Thử lần lượt model 0.6–0.9B trên crop/band bảng, batch 1, giới hạn kích thước theo hướng dẫn model. Không nạp đồng thời nhiều model. Nếu OOM, giữ vùng hẹp hơn hoặc CPU offload và đo chậm hơn; không hứa full-page VLM chạy ổn. |
| **8 GB** | Thử A1/A2 từng model, batch 1, toàn trang rồi crop vùng khó; đo VRAM đỉnh trên bảng dài. A3 cần đo FP32 trước hoặc kiểm riêng sai khác khi đổi precision. |

- Phải lấy tên GPU, VRAM trống và compute capability; không mặc định GPU cũ hỗ trợ BF16.
- Khoảng 1B tham số ở FP16 chỉ riêng weights đã cỡ 2 GB; activations, image tokens, cache, runtime và model bố cục còn chiếm thêm. Đây là phép ước lượng, không phải số memory benchmark.
- Hai GPU 4 GB không tự trở thành một GPU 8 GB cho mọi pipeline.
- Với VRAM thấp, ưu tiên thử Transformers/Paddle trực tiếp trước khi cấu hình server inference có cache lớn. Backend cuối cùng chọn sau khi đo tương thích và tốc độ.
- Chưa lượng tử hóa ngay trong lần đo chuẩn. Nếu cần INT8/INT4, chạy lại so sánh số, dấu và tên kháng thể trước khi chấp nhận.
- Không thu ảnh toàn trang quá nhỏ để vừa VRAM rồi bỏ mất chữ xét nghiệm; chia bảng theo dải hàng có tiêu đề, overlap và tọa độ để ghép/dedup.

## 6. Thiết kế pipeline để tận dụng model mới

```text
Ảnh gốc nội bộ
   → kiểm chất lượng / căn chỉnh
   → engine OCR/parser được chọn qua benchmark
   → observations có nguồn, dòng/cột, giá trị và đơn vị
   → chuẩn hóa/phân loại vào bộ trường nghiệp vụ lấy từ Word
   → validation và đối chiếu
   → pool JSON + schema/manifest → hệ thống lưu trữ phía sau

Chỉ vùng có lỗi/mơ hồ
   → crop có ngữ cảnh → model đối chứng local → giữ ứng viên
```

Không gọi model lần lượt 261 lần cho 261 mã. Đọc trang/vùng một lần rồi ánh xạ các quan sát vào hợp đồng đầu ra đầy đủ.

Không tự đưa toàn bộ 261 trường vào prompt của mọi OCR model: nhiều model chỉ được huấn luyện cho một số prompt chép chữ/bảng. Làm theo interface tác vụ của checkpoint rồi xử lý ngữ nghĩa bằng bộ ánh xạ.

Với hai engine bất đồng, không bỏ phiếu để tự kết luận số đúng; chuyển đối chiếu và giữ cả kết quả/crop. Hai engine cùng trả một số cũng chưa chứng minh số đó đúng. Confidence sinh token không tự thay thế chất lượng ánh xạ.

Mức bằng chứng cần phân biệt: bbox cả trang, block, dòng và cell. Bbox của bảng không phải bbox từng xét nghiệm. Nếu model chỉ có block, giữ block/trích dẫn và ghi đúng độ chi tiết; chỉ bổ sung detector/cell mapping khi cần, không tạo tọa độ giả.

## 7. Benchmark local cần làm trước khi chốt

### Vòng đầu: kiểm khả năng đọc và chạy trên GPU

Đề xuất một đợt thử ngắn **3–5 ngày kỹ thuật**, phụ thuộc thời gian chuẩn bị môi trường và người đối chiếu. Đây là ước lượng công việc, không phải benchmark đã thực hiện.

1. Kiểm cấu hình GPU; đóng gói môi trường độc lập cho mỗi engine để tránh xung đột Paddle/PyTorch/CUDA. Chuẩn bị weights local có revision/hash và kiểm license.
2. Đối chiếu nhãn nháp của 12 input. Bản 81 mục tìm thấy trước đây chưa phải ground truth độc lập. Gán nhãn theo từng quan sát/dòng, không chỉ trường tổng.
3. Chạy mốc PP-OCRv5, A1 và A2 trên cùng ảnh. Chạy A3 trên vùng Việt/viết tay và các bảng cần so thêm. Nếu còn vấn đề, mới thêm B1/B2.
4. Đo cả đọc toàn trang và đọc crop có ngữ cảnh. Ghi phiên bản, precision, kích thước, prompt, token limit, thời gian và VRAM. Chạy tuần tự, không nạp nhiều engine để đo.
5. Ánh xạ bằng cùng hợp đồng CRF và cùng quy tắc được phép; ghi rõ phần hậu xử lý riêng từng model. Báo cả chất lượng OCR thô và chất lượng cuối cùng.

### Những lỗi phải thống kê riêng

| Chỉ số | Cách đo |
| --- | --- |
| Đúng số | Exact match chuỗi số và dấu so sánh sau chuẩn hóa có kiểm soát; phân biệt 0/6/8, dấu chấm, số mũ |
| Đúng hàng/cột | Tên–kết quả–đơn vị–panel liên kết đúng; không tính số đọc đúng nhưng gán sai xét nghiệm là đạt |
| Đủ quan sát có trong nguồn | Recall trên các quan sát đã gán nhãn; tách các mục không có thông tin khỏi mẫu số |
| Điền đúng | Precision trên quan sát thực sự được điền; đo thêm tuple gồm chỉ số, giá trị, đơn vị, panel, phương pháp và ngày khi có |
| Dữ liệu bịa/điền thừa | Số trường có giá trị không có bằng chứng hoặc được chuyển từ ghi chú hướng dẫn; báo count cụ thể |
| Chữ Việt/viết tay | CER/WER trên vùng gán nhãn; tách riêng chữ in, chữ viết tay và nhãn kỹ thuật tiếng Anh |
| Đối chiếu nguồn | Có evidence hợp lệ, đúng độ chi tiết vùng; không tính bbox toàn trang là cell-level |
| Đủ schema pool | Đủ trường nghiệp vụ, thuộc tính con/lựa chọn và nhóm lặp theo Word; có giá trị/liên kết quan sát hoặc trạng thái; kiểm riêng với kiểm đúng OCR |
| Tài nguyên | OOM, giây/trang/ca, VRAM đỉnh, số token và đầu ra bị cắt/lặp |

Một trang/job đọc lỗi không được làm các trường thành `not_found`. Cần phân biệt chưa xử lý xong với thực sự không thấy dữ liệu.

Bộ hiện có chủ yếu cùng ca/bố cục, chưa đủ đo tổng quát hóa. Ảnh khác của cùng phiếu và ảnh crop không tạo ca kiểm tra độc lập. Trước dùng thực tế cần ca/bố cục khác chưa dùng tinh chỉnh; nhóm theo bệnh nhân/phiếu khi tách tập. Không lấy các trường thiếu đúng làm tỷ lệ thành công cao.

## 8. Bảo mật khi thử model mới

Tải weights/code trên môi trường chuẩn bị được kiểm soát rồi chuyển vào server; review code custom và khóa revision. Không bật `trust_remote_code` với code chưa xem chỉ để chạy nhanh. Dùng đường dẫn local cho model/tokenizer/processor, chặn egress và kiểm cả các phụ thuộc tự tải model.

Các endpoint ghi theo chuẩn API của một hãng có thể chạy tại localhost; chỉ cho phép địa chỉ nội bộ đã cấu hình. Không copy nguyên ví dụ dùng URL ảnh/dịch vụ bên ngoài trong model card vào pipeline dữ liệu y tế.

Không đưa hồ sơ thật vào Spaces/demo, notebook cloud, trace ngoài đơn vị hoặc báo lỗi công khai. Mọi crop, raw output, file render và benchmark result được bảo vệ như dữ liệu gốc. Nghiên cứu này chỉ tra tài liệu công khai, chưa chạy inference bằng dịch vụ bên ngoài.

## 9. Quyết định thực hiện đề xuất

- **POC chính:** PaddleOCR-VL-1.6.
- **Đối chứng trước khi chốt:** MonkeyOCRv2-B-Parsing.
- **Bổ sung cho tiếng Việt:** SenOCR-Vi, đo riêng hiệu quả trên bảng và ghi chú.
- **Mốc mô-đun:** PP-OCRv5 tiếng Việt + cấu trúc bảng đã có.
- **Vòng sau nếu cần:** Nemotron-3.5-Parse và LightOnOCR-3-0.8B.
- **Chưa đưa vào mặc định:** PP-OCRv6 recognizer cho Việt đến khi xác minh checkpoint/dict phù hợp.

Chỉ giữ engine/model dự phòng đem lại lợi ích được đo. Bộ trường dựa trên Word, trạng thái thiếu và truy nguồn theo [đặc tả OCR → pool](./OCR-TO-CRF-SPEC.md) và [hợp đồng dữ liệu](./OCR-DATA-POOL-CONTRACT.md). Bộ xuất Word thuộc hệ thống lưu trữ phía sau.
