# Triển khai Lupiva Next.js lên máy pilot (Ubuntu)

Next.js chạy dạng `standalone` (build trên Windows, chỉ chép kết quả lên pilot vì pilot chỉ có 3 GB RAM), dùng **PostgreSQL** cài bằng apt trên pilot, gọi backend Python ở `127.0.0.1:8877` (`scripts/web_pilot.py`, nhận caller cùng máy qua `127.0.0.1`).

```
~/lupiva-next/
├── node/                 # Node.js 22 (tải tay, không cần sudo)
├── releases/<ngày-giờ>/  # mỗi lần deploy một thư mục
├── current -> releases/… # service chạy từ đây
├── data/uploads/         # UPLOAD_DIR — ảnh đã mã hóa
└── .env                  # chmod 600
```

## 0. Một lần trên pilot

- **Node.js ≥ 20.9** (Next 16), dùng bản 22 LTS tải về `~/lupiva-next/node` và kiểm `SHASUMS256.txt`.
- **PostgreSQL** — chạy trong terminal thật (sudo cần TTY, không chạy qua `!` của Claude Code):
  ```
  sudo apt-get install -y postgresql
  sudo -u postgres createuser <linux-user>
  sudo -u postgres createdb -O <linux-user> lupiva
  ```
  App kết nối qua socket nội bộ, xác thực peer (không mật khẩu, không mở cổng TCP):
  `DATABASE_URL=postgres://<linux-user>@/lupiva?host=/var/run/postgresql`.
  Mặc định `shared_buffers` 128 MB là chấp nhận được; muốn giảm phải sửa `/etc/postgresql/18/main/postgresql.conf` bằng sudo.

## 1. Build + đóng gói trên Windows

```
NEXT_PUBLIC_DEMO_MODE=false npm run build     # biến NEXT_PUBLIC_* được gắn lúc build
npm run package:standalone                    # → dist/lupiva-web.tar.gz (~9 MB)
```
Script chỉ chép `server.js`, `package.json`, `.next`, `node_modules`, `public` và dừng nếu thấy `.env`, `src`, `tests`, `.data`.

## 2. Schema và tài khoản

1. Sinh SQL schema (offline): `npx drizzle-kit generate --dialect postgresql --schema ./src/db/schema.ts --out <tmp>/migrations`.
2. Chép file `.sql` lên pilot rồi chạy:
   `(echo BEGIN; sed 's/--> statement-breakpoint//' schema.sql; echo COMMIT) | psql -v ON_ERROR_STOP=1 -d lupiva`
3. Seed tài khoản demo: `DATABASE_URL=… npx tsx scripts/db-init.mts` khi có kết nối tới DB (chuyển tiếp cổng SSH từ Windows từng bị reset; có thể thay bằng xuất dữ liệu thành SQL rồi chạy `psql` trên pilot).
4. **Luôn đổi mật khẩu tài khoản seed** (mật khẩu seed công khai trong mã nguồn):
   `npx tsx scripts/set-password.mts <email> <mật khẩu mới ≥ 12 ký tự>` — script cũng xóa phiên đăng nhập cũ.

## 3. Release mới

```
scp dist/lupiva-web.tar.gz <pilot>:lupiva-next/incoming/
# trên pilot:
R=releases/$(date +%Y%m%d-%H%M%S); mkdir -p ~/lupiva-next/$R
tar -xzf ~/lupiva-next/incoming/lupiva-web.tar.gz -C ~/lupiva-next/$R --strip-components=1
ln -sfn $R ~/lupiva-next/current && systemctl --user restart lupiva-next
```

## 4. `.env` trên pilot

| Biến | Ghi chú |
|---|---|
| `ENCRYPTION_MASTER_KEY`, `BLIND_INDEX_KEY`, `AUTH_SECRET` | 3 khóa khác nhau, mỗi khóa `openssl rand -hex 32`. Dòng trong DB được mã hóa bằng các khóa này: **mất `.env` là không đọc được dữ liệu**, đổi khóa cũng vậy. |
| `DATABASE_URL` | như mục 0 |
| `UPLOAD_DIR` | `/home/<user>/lupiva-next/data/uploads` |
| `PIPELINE_URL` | `http://127.0.0.1:8877` |
| `PIPELINE_ENGINE` | `gemini` |
| `SPECIALIST_INVITE_CODE` | chuỗi ngẫu nhiên |
| `COOKIE_SECURE` | `true` (đi qua HTTPS của tunnel) |

## 5. Service

`deploy/lupiva-next.service` → `~/.config/systemd/user/`, sửa `ExecStart` thành `%h/lupiva-next/node/bin/node server.js`, rồi `systemctl --user daemon-reload && systemctl --user enable --now lupiva-next`. Kiểm: `curl -s http://127.0.0.1:3000/api/health`.

## 6. Rollback

`ln -sfn releases/<bản-cũ> ~/lupiva-next/current && systemctl --user restart lupiva-next`. Chỉ cần khôi phục DB nếu bản mới đã đổi schema.

## 7. Backup

```
pg_dump -Fc lupiva > lupiva-$(date +%F).dump        # khôi phục: pg_restore -d lupiva --clean <file>
tar -czf uploads-$(date +%F).tar.gz -C ~/lupiva-next/data uploads
cp ~/lupiva-next/.env env-$(date +%F).bak             # giữ ở nơi an toàn, cùng chỗ với dump
```

Không mô tả việc đổi Cloudflare tunnel ở đây; quyết định riêng.
