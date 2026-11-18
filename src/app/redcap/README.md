# Tích hợp REDCap — Tài liệu Đặc tả (Chờ cấp quyền truy cập)

## 1. Trạng thái Hiện tại
- Hệ thống **chưa được cấp quyền truy cập (API URL & API Token)** tới máy chủ **REDCap** của dự án.
- Trong thời gian chờ cấp quyền, tab **REDCap** trên giao diện bác sĩ hiển thị danh sách các hồ sơ đã phê duyệt (`approved`) và hỗ trợ **xuất tệp CSV chuẩn REDCap** để nhập thủ công khi cần.

## 2. Cấu hình cần thiết khi được cấp quyền REDCap
Khi nhận được thông tin kết nối từ quản trị viên REDCap, bổ sung các biến môi trường sau vào `.env`:

```env
REDCAP_API_URL="https://redcap.example.org/api/"
REDCAP_API_TOKEN="YOUR_32_CHAR_PROJECT_TOKEN"
```

> **Lưu ý bảo mật**: `REDCAP_API_TOKEN` chỉ được sử dụng ở phía máy chủ (Next.js Route Handler, ví dụ `POST /api/redcap/sync`), tuyệt đối không truyền xuống trình duyệt (`NEXT_PUBLIC_*`).

## 3. Ánh xạ Trường Dữ liệu Cơ bản (Lupiva e-CRF -> REDCap)

| Trường Lupiva e-CRF | Biến REDCap đề xuất | Mô tả |
| :--- | :--- | :--- |
| `studyId` | `record_id` | Mã định danh bệnh nhân trong nghiên cứu (VD: `VN-0084-26`) |
| `age` | `demog_age` | Tuổi |
| `gender` | `demog_gender` | Giới tính (`1` = Female, `2` = Male) |
| `icfSignedDate` | `icf_signed_date` | Ngày ký phiếu đồng ý tham gia nghiên cứu |
| `heightCm` / `weightKg` | `height_cm`, `weight_kg` | Chiều cao (cm), Cân nặng (kg) |
| `eularSummary.totalScore` | `eular_total_score` | Tổng điểm phân loại EULAR/ACR 2019 |
| `eularSummary.isClassifiedSle` | `eular_classified_sle` | Đạt chuẩn phân loại SLE (`1` = Yes, `0` = No) |
| `sledaiSummary.totalScore` | `sledai_total_score` | Tổng điểm hoạt tính bệnh SLEDAI-2K |
| `signedOffBy` | `crf_signed_by` | Bác sĩ chuyên khoa ký phê duyệt |
| `submissionStatus` | `sle_crf_complete` | Trạng thái hoàn thành form trên REDCap (`2` = Complete) |

## 4. Quy trình đồng bộ dự kiến sau khi có Access
1. Bác sĩ ký duyệt hồ sơ ở tab **CRF**.
2. Server kiểm tra điều kiện `submissionStatus === "approved"`.
3. Gọi `POST REDCAP_API_URL` với `content=record`, `format=json`, `type=flat`, `overwriteBehavior=normal` và `token=REDCAP_API_TOKEN`.
4. Ghi nhận audit log (`redcap.synced`) không chứa PII vào bảng `audit_logs`.
