# Triển khai Lupiva Next.js lên máy pilot (Ubuntu)

Máy pilot: Ubuntu, 3 GB RAM, 4 core, đã có backend Python chạy ở `127.0.0.1:8877`.
**Không build trên pilot** (thiếu RAM) — build trên máy dev Windows, chỉ chép kết quả sang.

Next.js chạy bằng **systemd user service**, nghe `127.0.0.1:3000`, dùng database nhúng
**PGlite** (một thư mục, không cần server database riêng).

## 0. Yêu cầu trên pilot

- **Node.js ≥ 20.9** (yêu cầu tối thiểu của Next.js 16, theo `node_modules/next/dist/docs/01-app/01-getting-started/01-installation.md`). Khuyến nghị **Node 22 LTS**. Cài bằng NodeSource hoặc nvm, kiểm tra: `node --version`.
- `tar`, `scp`/`ssh` (có sẵn trên Ubuntu).
- Bật linger để user service chạy cả khi không đăng nhập:
  ```bash
  sudo loginctl enable-linger $USER
  ```

Bố cục thư mục trên pilot (dưới home của user chạy dịch vụ):

```
~/lupiva-next/
├── .env                  # biến môi trường (không commit)
├── releases/
│   └── 2026-11-16/       # mỗi lần phát hành một thư mục theo ngày
├── current -> releases/2026-11-16   # symlink trỏ tới bản đang chạy
└── data/
    ├── pglite/           # PGLITE_DIR — database nhúng
    └── uploads/          # UPLOAD_DIR — ảnh nguồn đã mã hóa
```

## 1. Build + đóng gói trên Windows

Trong thư mục dự án (Git Bash):

```bash
npm run build                 # next build với output: "standalone"
npm run package:standalone    # tạo dist/lupiva-web/ và dist/lupiva-web.tar.gz
```

Script đóng gói đã gom sẵn `.next/static` và `public` vào đúng chỗ, và kiểm tra
các file runtime của PGlite (`pglite.wasm`, `pglite.data`, `initdb.wasm`) có mặt
trong output. Kích thước tarball được in ra cuối lệnh.

**Lưu ý `NEXT_PUBLIC_DEMO_MODE`:** biến `NEXT_PUBLIC_*` được nhúng vào bundle lúc
build. Muốn đặt `true`/`false` cho pilot thì phải đặt trong `.env` trên máy
Windows **trước khi** `npm run build` (khai lại trong `.env` trên pilot chỉ để
nhất quán, không đổi được bundle client).

## 2. Tạo thư mục PGlite trên Windows rồi chép sang

Tạo `.env` trên máy dev từ `.env.example` với 3 khóa thật (xem mục 4), vì script
seed nạp `.env` và mã hóa dữ liệu demo bằng các khóa đó. Sau đó (Git Bash):

```bash
PGLITE_DIR=.data/pglite npx tsx scripts/pglite-init.mts
```

(PowerShell: `$env:PGLITE_DIR=".data/pglite"; npx tsx scripts/pglite-init.mts`)

Lệnh tạo schema + seed tài khoản demo vào thư mục `.data/pglite`.

Chép tarball và thư mục database lên pilot:

```bash
scp dist/lupiva-web.tar.gz <user>@<pilot>:~/lupiva-next/
scp -r .data/pglite <user>@<pilot>:~/lupiva-next/data/
```

> **Quan trọng:** các dòng đã mã hóa trong thư mục PGlite chỉ mở được bằng
> **đúng bộ khóa đã dùng lúc tạo ra nó**. `.env` trên pilot phải dùng lại đúng
> `ENCRYPTION_MASTER_KEY`, `BLIND_INDEX_KEY`, `AUTH_SECRET` từ `.env` trên máy
> dev khi chạy `pglite-init.mts`. Đổi khóa = không đọc được dữ liệu cũ.

## 3. Giải nén vào thư mục release theo ngày, trỏ symlink `current`

Trên pilot:

```bash
cd ~/lupiva-next
RELEASE=releases/$(date +%Y-%m-%d)     # thêm -2, -3... nếu phát hành nhiều lần trong ngày
mkdir -p "$RELEASE"
tar -xzf lupiva-web.tar.gz -C "$RELEASE" --strip-components=1
ln -sfn "$RELEASE" current
```

`--strip-components=1` bỏ thư mục gốc `lupiva-web/` để `server.js` nằm ngay
trong `releases/<ngày>/`.

## 4. File `.env` trên pilot (`~/lupiva-next/.env`)

Định dạng `KEY=value`, không dùng `export`. Các khóa cần có:

| Khóa | Giá trị / ý nghĩa |
|---|---|
| `ENCRYPTION_MASTER_KEY` | 64 ký tự hex (32 byte), tạo bằng `openssl rand -hex 32`. **Phải trùng khóa đã dùng khi tạo thư mục PGlite.** |
| `BLIND_INDEX_KEY` | 64 hex, **khác** hai khóa còn lại. Cũng phải trùng lúc tạo DB. |
| `AUTH_SECRET` | 64 hex, **khác** hai khóa còn lại. Cũng phải trùng lúc tạo DB. |
| `SPECIALIST_INVITE_CODE` | Mã mời khi đăng ký tài khoản bác sĩ chuyên khoa trên `/api/auth/register`. |
| `PGLITE_DIR` | Đường dẫn tuyệt đối, ví dụ `/home/<user>/lupiva-next/data/pglite`. Khi đặt biến này, `DATABASE_URL` bị bỏ qua. |
| `UPLOAD_DIR` | Đường dẫn tuyệt đối, ví dụ `/home/<user>/lupiva-next/data/uploads`. Chỉ chứa ciphertext; để ngoài web root và backup cùng database. |
| `PIPELINE_URL` | `http://127.0.0.1:8877` — backend Python có sẵn trên pilot. |
| `PIPELINE_ENGINE` | Engine trích xuất cho bệnh nhân gửi hồ sơ, ví dụ `gemini` (xem các engine intake của `registry_review`). |
| `NEXT_PUBLIC_DEMO_MODE` | `"true"` khi chạy demo/đánh giá, `"false"` cho lâm sàng. Nhớ rằng giá trị thực tế đã nhúng vào bundle lúc build trên Windows (mục 1). |
| `COOKIE_SECURE` | Override cờ Secure của cookie. Đặt `"true"` khi truy cập qua HTTPS; `"false"` chỉ khi thử nghiệm thuần HTTP nội bộ. Bỏ trống thì tự nhận diện theo HTTPS trong production. |

Ba khóa phải **khác nhau từng đôi một** và không bao giờ commit vào git.

Ví dụ:

```dotenv
ENCRYPTION_MASTER_KEY=<64-hex-giống-lúc-tạo-db>
BLIND_INDEX_KEY=<64-hex-khác>
AUTH_SECRET=<64-hex-khác-nữa>
SPECIALIST_INVITE_CODE=VINMEC-IMMUNO-2026
PGLITE_DIR=/home/lupiva/lupiva-next/data/pglite
UPLOAD_DIR=/home/lupiva/lupiva-next/data/uploads
PIPELINE_URL=http://127.0.0.1:8877
PIPELINE_ENGINE=gemini
NEXT_PUBLIC_DEMO_MODE=true
COOKIE_SECURE=true
```

## 5. Cài và khởi động user service

Unit mẫu nằm ở `deploy/lupiva-next.service` trong repo (chép cùng đợt phát hành):

```bash
mkdir -p ~/.config/systemd/user
cp deploy/lupiva-next.service ~/.config/systemd/user/   # hoặc scp file này từ máy dev
systemctl --user daemon-reload
systemctl --user enable --now lupiva-next.service
```

Unit chạy `node server.js` trong `%h/lupiva-next/current`, nạp
`EnvironmentFile=%h/lupiva-next/.env`, đặt `HOSTNAME=127.0.0.1`, `PORT=3000`,
`NODE_ENV=production`, giới hạn `MemoryMax=600M` và tự khởi động lại khi lỗi.

Kiểm tra:

```bash
systemctl --user status lupiva-next.service
journalctl --user -u lupiva-next.service -f
curl -s http://127.0.0.1:3000/ -o /dev/null -w "%{http_code}\n"
```

## 6. Rollback

Mỗi release nằm nguyên trong thư mục theo ngày, rollback chỉ là trỏ lại symlink:

```bash
cd ~/lupiva-next
ln -sfn releases/<ngày-cũ> current
systemctl --user restart lupiva-next.service
```

Lưu ý: nếu bản mới đã chạy migration làm đổi schema PGlite thì bản cũ có thể
không tương thích — khi đó khôi phục thêm thư mục `data/pglite` từ backup
(mục 7) trước khi restart.

## 7. Backup

Dữ liệu nằm trọn trong hai thư mục: `PGLITE_DIR` (database) và `UPLOAD_DIR`
(ảnh nguồn đã mã hóa). Backup phải nhất quán — dừng dịch vụ trước khi chép:

```bash
systemctl --user stop lupiva-next.service
tar -czf ~/backup-lupiva-$(date +%Y-%m-%d).tar.gz \
  -C ~/lupiva-next/data pglite uploads
systemctl --user start lupiva-next.service
```

Giữ file backup ở nơi khác (máy dev/ổ ngoài). Nhớ lưu kèm bộ khóa `.env` ở nơi
an toàn tách biệt — không có khóa thì backup mã hóa không mở được.