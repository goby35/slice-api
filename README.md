Prerequisites:

- [Vercel CLI](https://vercel.com/docs/cli) installed globally

To develop locally:

```
npm install
## Slice API (Hono) — README

Hướng dẫn nhanh để phát triển, build và deploy `slice-api` (Hono) — bao gồm các ghi chú về biến môi trường cần thiết và các endpoint proxy tới `api.hey.xyz`.

## Yêu cầu trước

- Node.js (>=18 recommended)
- npm
- Vercel CLI (nếu bạn muốn dùng `vercel dev` / deploy từ CLI): https://vercel.com/docs/cli

## Biến môi trường quan trọng

- `LENS_API_URL` — bắt buộc. Dùng để lấy JWKS và xác thực JWT. Ví dụ: `https://api.hey.xyz/graphql` hoặc URL Lens tương ứng.
- `SHARED_SECRET` — (tuỳ nếu bạn dùng `secretMiddleware`) mã chia sẻ cho một số route bảo mật.

Thiết lập trong PowerShell (tạm thời cho session hiện tại):

```powershell
$env:LENS_API_URL = 'https://api.hey.xyz/graphql'
$env:SHARED_SECRET = 'your_shared_secret_here'
```

Hoặc trong bash / macOS / Linux:

```bash
export LENS_API_URL='https://api.hey.xyz/graphql'
export SHARED_SECRET='your_shared_secret_here'
```

Trên Vercel: vào Settings → Environment Variables và thêm `LENS_API_URL` (và `SHARED_SECRET` nếu cần) cho Production/Preview/Development.

## Cài đặt phụ thuộc

```powershell
npm install
```

## Chạy chế độ phát triển (local)

Hai cách:

- Dùng Vercel Dev (mô phỏng environment serverless):

```powershell
npx vercel dev
# hoặc nếu đã cài vercel CLI toàn cục
vc dev
```

- Hoặc build và chạy file JS output trực tiếp:

```powershell
npm run build   # biên dịch TypeScript -> ./dist
node ./dist/src/index.js
```

Mặc định server chạy trên `http://127.0.0.1:3000` (hoặc port hiển thị trong terminal của `vercel dev`).

## Scripts tiện ích (package.json)

- `npm run build` — bundle bằng `tsup` (ESM) và ghi ra `./dist` (dùng cho Vercel)
- `npm run typecheck` — chỉ chạy TypeScript typecheck (`tsc --noEmit`)
- `npm run vercel-build` — build + typecheck (dùng làm script `vercel-build` nếu cần)
- `node scripts/check-jwks.mjs` — kiểm tra JWKS reachable và in ra `kid`/`kty`/`alg` (hữu ích để debug `LENS_API_URL`)

## Endpoints chính (shim/proxy)

Server hiện có các route shim để forward tới `https://api.hey.xyz` cho các đường dẫn legacy:

- GET `/oembed/get?url=...` -> forwarded đến `https://api.hey.xyz/oembed/get?url=...`
- GET `/metadata/sts` -> forwarded đến `https://api.hey.xyz/metadata/sts`
- POST `/pageview` -> forwarded đến `https://api.hey.xyz/pageview` (yêu cầu auth)
- POST `/posts` -> forwarded đến `https://api.hey.xyz/posts` (yêu cầu auth)

Proxy giữ nguyên các header thiết yếu (Authorization, cookies, Content-Type, v.v.), hỗ trợ body nhị phân và timeouts.

## Xác thực (Auth)

- Middleware xác thực lấy token từ nhiều nguồn: `Authorization: Bearer <token>`, header `X-Access-Token`, header `token`, hoặc cookie `access_token` / `token`.
- Middleware sẽ verify JWT bằng JWKS được lấy từ `LENS_API_URL`.

Lưu ý: `LENS_API_URL` phải được cấu hình trong environment (trên Vercel hoặc cục bộ) trước khi gọi các route được bảo vệ; nếu middleware được khởi tạo tại import-time và biến chưa tồn tại, server có thể throw — repo này đã sử dụng lazy init để tránh lỗi build-time.

## Kiểm thử nhanh (curl)

- OEmbed:

```powershell
curl "http://127.0.0.1:3000/oembed/get?url=https://example.com" -i
```

- Metadata STS:

```powershell
curl "http://127.0.0.1:3000/metadata/sts" -i
```

- Pageview (POST, cần token nếu route yêu cầu):

```powershell
curl -X POST "http://127.0.0.1:3000/pageview" -H "Content-Type: application/json" -H "Authorization: Bearer <JWT>" -d '{"path":"/some/path"}' -i
```

## Vercel: deploy

1. Đảm bảo biến môi trường (`LENS_API_URL`, `SHARED_SECRET`) đã được thêm trong Vercel Project Settings.
2. Nếu bạn dùng CI/CD hoặc CLI, deploy bằng:

```powershell
npx vercel deploy --prod
# hoặc vc deploy nếu đã cài vercel CLI
```

## Troubleshooting (những lỗi thường gặp)

- ERR_MODULE_NOT_FOUND khi deploy (Cannot find module '/var/task/src/middlewares/authMiddleware')
	- Nguyên nhân: runtime ESM cần import specifier khớp file `.js` sau khi biên dịch. Giải pháp:
		- Sửa import nội bộ trong source TS để thêm hậu tố `.js` (ví dụ `import x from './foo.js'`) hoặc
		- Sử dụng bundler (tsup/esbuild) để build output có specifiers hợp lệ.
- Lỗi `LENS_API_URL environment variable is required` lúc deploy
	- Nguyên nhân: middleware attempt to read env at import time. Giải pháp: đảm bảo `LENS_API_URL` được cấu hình trong Vercel Environment Variables, hoặc sửa middleware để lazy-init JWKS (tránh đọc env tại import).

## Ghi chú kỹ thuật

- Dự án sử dụng Hono framework và `jose` để verify JWT.
- Tools hỗ trợ debug JWKS/JWT:
	- `node scripts/decode-jwt.mjs <JWT>` — decode header & payload (không verify) và gợi ý `openid-configuration` / `jwks.json` từ claim `iss`.
	- `node scripts/check-jwks.mjs <LENS_API_URL>` — thử fetch JWKS bằng nhiều candidate URL và in ra các `kid`/`kty`/`alg`.
- Rate limiter hiện là in-memory (dùng cho dev). Với production multi-replica bạn nên chuyển sang Redis hoặc dịch vụ chia sẻ.

## 🎯 Tính năng mới: SocialFi Jobs Flow

Dự án hiện đã triển khai **flow hoàn chỉnh** cho hệ thống SocialFi Jobs theo UML diagram, bao gồm:

### ✨ Tính năng chính
- ✅ **9 loại thông báo** (task_created, application_received, application_accepted, application_rejected, ...)
- ✅ **Auto-approve logic**: Tự động duyệt khi freelancer submit lại sau revision
- ✅ **Task checklists**: Quản lý checklist cho mỗi task
- ✅ **Rating system**: Đánh giá 1-5 sao với comment
- ✅ **Multi-status workflow**: open → in_review → in_progress → completed/cancelled

### 📚 API Documentation
Xem chi tiết đầy đủ flow và API endpoints tại: **[docs/API_FLOW.md](./docs/API_FLOW.md)**

### 🗄️ Database Migration
Chạy migration để tạo bảng mới:
```bash
psql -U postgres -d your_database -f migrations/001_add_notifications_and_checklists.sql
```

### 🚀 Các endpoint mới
- **Tasks**: `POST /tasks` với checklist support
- **Applications**: `POST /applications`, `PUT /applications/:id`, `POST /applications/:id/rate`
- **Notifications**: `GET /notifications`, `PUT /notifications/:id/read`, `PUT /notifications/read-all`

---

Nếu cần bản tóm tắt ngắn hơn hoặc bản tiếng Anh, báo tôi biết.
