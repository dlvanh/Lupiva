# Hướng dẫn chạy Vietnam Lupus Registry

Hệ thống gồm hai phần chạy cùng nhau:

| Phần | Thư mục | Cổng mặc định | Vai trò |
|---|---|---|---|
| Backend Python | `registry_review/`, `ocr_pool/`, `registry_pool/`, `registry_export/` | `127.0.0.1:8773` | Nhận ảnh, trích xuất (OCR/LLM), lưu CRF, xuất Word/REDCap. Nguồn dữ liệu CRF chính. |
| Web Next.js | `web/` | `localhost:3000` | Cổng bệnh nhân (đăng ký, nộp ảnh, xem trạng thái), Dashboard bác sĩ, Duyệt hồ sơ, Phiếu CRF. Gọi backend qua `PIPELINE_URL`. |

Chi tiết thêm: backend `DEVELOPMENT.md`, deploy pilot `web/deploy/PILOT-DEPLOY.md`.

## 1. Cần cài

- Python 3.11
- Node.js ≥ 20.9 (khuyến nghị 22 LTS)
- PostgreSQL 16 (dùng Docker qua `web/docker-compose.yml`, hoặc cài trực tiếp)
- Khóa API của một endpoint LLM tương thích OpenAI (chỉ cần khi trích xuất bằng LLM)

## 2. Backend Python

```powershell
# từ thư mục gốc repo
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-privacy.txt -r requirements-test.txt
```

Tạo `.env` ở thư mục gốc (không commit). Tên biến vẫn giữ tiền tố `GEMINI_` dù endpoint là OpenAI-compatible:

```
GEMINI_API_KEY=<khóa>
GEMINI_MODEL=<tên model>
GEMINI_BASE_URL=<url endpoint, ví dụ proxy nội bộ>
# Tùy chọn: gửi thẳng ảnh cho LLM (bản prototype, không qua OCR tại chỗ)
# LUPIVA_PROTOTYPE_DIRECT_LLM=1
```

Mẫu đầy đủ (tên biến chuẩn, giá trị trống): `.env.example` ở thư mục gốc. Luồng dữ liệu và PII: `PRIVACY.md`.

### Ba luồng trích xuất thử nghiệm

| Luồng | Cách chạy | Gửi ra ngoài |
|---|---|---|
| A. Direct LLM (chỉ ảnh giả) | `.env`: `LUPIVA_PROTOTYPE_DIRECT_LLM=1` | Nguyên ảnh |
| B. OCR → cắt/che PII → LLM | mặc định của intake; `scripts/run_llm_pool.py` | Ảnh đã cắt/che + text OCR, qua cổng chặn cuối |
| C. Lai: OCR trước, LLM khi cần | `scripts/run_hybrid_pool.py` | Không gì với trang OCR tự đủ; trang còn lại đi luồng B với vùng che đề xuất tại máy |

Chạy luồng C (cần `.venv-senocr` và `.venv-privacy-trial`; `--dry-run` = không gọi API):

```powershell
python -X utf8 scripts
un_hybrid_pool.py --manifest <manifest.json> --output research\hybrid-run-01 --dry-run
```

`<manifest.json>`: `{"documents": [{"document_id": "IN-1", "input_path": "examples/inputs/a.jpg"}]}`. Kết quả ở `routing.json`: trang nào `local` / `api` / `held` (chưa che tự động được, không gửi) / `skipped` (chỉ biểu đồ), lý do và thời gian.

Chạy server:

```powershell
.\.venv\Scripts\python.exe -X utf8 -m registry_review.server --db LOCAL-REGISTRY.sqlite --port 8773 --synthetic `
  --export-template "260825_Vivi_MDDU_CRF_SLE_AI thực chiến.docx"
```

- `--synthetic`: đánh dấu kho chỉ chứa dữ liệu giả lập (dùng khi thử).
- Các tùy chọn khác: `--bundle`, `--export-dir`, `--export-ledger`, `--redcap-project`.
- Mở `http://127.0.0.1:8773` để dùng giao diện duyệt gốc của backend.
- OCR tại chỗ (SenOCR-Vi, PP-DocLayout) cần PyTorch/CUDA và tải model riêng: xem `DEVELOPMENT.md` và `scripts/setup_senocr_local.ps1`.

## 3. Web Next.js

```bash
cd web
npm ci
cp .env.example .env
```

Sửa `web/.env`:

- `ENCRYPTION_MASTER_KEY`, `BLIND_INDEX_KEY`, `AUTH_SECRET`: ba khóa khác nhau, mỗi khóa tạo bằng `openssl rand -hex 32`. **Mất khóa là mất dữ liệu đã mã hóa.**
- `DATABASE_URL`: Postgres (mặc định của docker compose: `postgres://lupiva:lupiva_dev_password@localhost:5432/lupiva`).
- `PIPELINE_URL=http://127.0.0.1:8773` (backend ở bước 2).
- `PIPELINE_ENGINE`: engine trích xuất cho hồ sơ bệnh nhân (`gemini` = LLM cấu hình ở `.env` backend).
- `UPLOAD_DIR`: thư mục chứa ảnh đã mã hóa, đặt ngoài thư mục web.
- `NEXT_PUBLIC_DEMO_MODE=false` khi chạy thật (`true` bật nút tự điền tài khoản mẫu).
- `SPECIALIST_INVITE_CODE`: chỉ cần nếu muốn tạo tài khoản bác sĩ qua API; màn hình đăng ký chỉ tạo tài khoản bệnh nhân.

Khởi tạo cơ sở dữ liệu và chạy:

```bash
docker compose up -d postgres                 # hoặc dùng Postgres có sẵn
npx tsx scripts/db-init.mts                   # tạo bảng + tài khoản mẫu (đọc DATABASE_URL)
npx tsx scripts/set-password.mts <email> <mật-khẩu-mới>   # đổi mật khẩu tài khoản mẫu (≥ 12 ký tự)
npm run dev                                   # http://localhost:3000
```

`db-init.mts` chạy lại được: chỉ cập nhật schema, dừng nếu thay đổi làm mất dữ liệu. Bản thay đổi schema thủ công nằm trong `web/deploy/migrations/`.

### Thử nhanh

1. Mở `http://localhost:3000` → **Đăng nhập** → tab **Đăng ký bệnh nhân** → nộp ảnh phiếu.
2. Đăng nhập tài khoản bác sĩ (tài khoản mẫu sau khi đổi mật khẩu) → chuông trên thanh điều hướng hiện số hồ sơ mới → **Dashboard** → **Duyệt hồ sơ** → **Phê duyệt hồ sơ** → **Phiếu CRF** / xuất REDCap.

## 4. Kiểm thử

```bash
# Web
cd web
npm test              # vitest
npx tsc --noEmit
npm run lint
```

```powershell
# Backend (thư mục gốc)
.\.venv\Scripts\python.exe -X utf8 -m unittest discover -s tests
node tests/review_intake_ui_smoke.cjs   # và các tests/*_smoke.cjs khác
```

## 5. Deploy lên pilot (tóm tắt)

Đầy đủ ở `web/deploy/PILOT-DEPLOY.md`.

```bash
cd web
NEXT_PUBLIC_DEMO_MODE=false npm run build
npm run package:standalone                    # → dist/lupiva-web.tar.gz
scp dist/lupiva-web.tar.gz <pilot>:lupiva-next/incoming/
# trên pilot:
R=releases/$(date +%Y%m%d-%H%M%S); mkdir -p ~/lupiva-next/$R
tar -xzf ~/lupiva-next/incoming/lupiva-web.tar.gz -C ~/lupiva-next/$R --strip-components=1
ln -sfn $R ~/lupiva-next/current && systemctl --user restart lupiva-next
curl -s http://127.0.0.1:3000/api/health
```

Rollback: `ln -sfn releases/<bản-cũ> ~/lupiva-next/current && systemctl --user restart lupiva-next`. Có migration mới thì backup DB (`pg_dump`) trước khi chạy.

## 6. Không đưa vào Git

`.env`, `web/.env`, ảnh/hồ sơ, SQLite, dump DB, model, `research/`, `outputs/`, `tmp/`.
