# 📋 Tóm Tắt Thay Đổi - Submit Outcome Flow

## 🎯 Mục Đích

Cập nhật logic submit outcome để phản ánh đúng quy trình nghiệp vụ:
- Freelancer nộp kết quả lần 1 → Employer review
- Employer approve HOẶC request revision
- Nếu request revision → Freelancer nộp lần 2 → TỰ ĐỘNG approve

---

## ⚡ Thay Đổi Chính

### 1. Database Schema

**File:** `src/db/schema.ts`

**Thêm column mới:**
```typescript
submissionCount: integer("submission_count").notNull().default(0)
```

**Migration SQL:** `migrations/002_add_submission_count.sql`

```sql
ALTER TABLE task_applications
ADD COLUMN submission_count INTEGER NOT NULL DEFAULT 0;
```

---

### 2. API Endpoint Mới

**Endpoint:** `POST /applications/:id/submit`

**Chức năng:** Freelancer nộp outcome (kết quả công việc)

**Request Body:**
```json
{
  "outcome": "string (text hoặc URL)",
  "outcomeType": "text" | "file"
}
```

**Logic:**

#### Trường hợp 1: Submit lần đầu
- Điều kiện: `application.status = "accepted"` hoặc `"submitted"`
- Kết quả:
  - `application.status` → `"in_review"`
  - `task.status` → `"in_review"`
  - Gửi notification #4 (`task_submitted`) cho Employer

#### Trường hợp 2: Resubmit sau revision
- Điều kiện: `application.status = "needs_revision"`
- Kết quả:
  - `application.status` → `"completed"` ⭐
  - `task.status` → `"completed"` ⭐
  - `submission_count` +1
  - `completedAt` = now
  - Gửi notifications: #4, #6, #7 (submitted, approved, rating_reminder)

---

### 3. Flow Cũ vs Flow Mới

#### ❌ Flow Cũ (Đã Bỏ)

```
POST /applications (với status needs_revision)
  → Tự động resubmit và complete
  → KHÔNG ĐÚNG nghiệp vụ
```

#### ✅ Flow Mới

```
Bước 1: Freelancer apply
  POST /applications { taskId, coverLetter }
  → application.status = "submitted"

Bước 2: Employer accept
  PUT /applications/:id { status: "accepted" }
  → application.status = "accepted"
  → task.status = "in_progress"

Bước 3: Freelancer submit outcome lần 1
  POST /applications/:id/submit { outcome, outcomeType }
  → application.status = "in_review"
  → task.status = "in_review"

Bước 4a: Employer approve ngay
  PUT /applications/:id { status: "completed", rating?, comment? }
  → application.status = "completed"
  → task.status = "completed"
  → KẾT THÚC

Bước 4b: Employer request revision
  PUT /applications/:id { status: "needs_revision", feedback }
  → application.status = "needs_revision"

Bước 5: Freelancer resubmit
  POST /applications/:id/submit { outcome, outcomeType }
  → application.status = "completed" ⭐ TỰ ĐỘNG
  → task.status = "completed" ⭐ TỰ ĐỘNG
  → submission_count = 1

Bước 6: Employer rate (optional)
  POST /applications/:id/rate { rating, comment }
  → Lưu rating
```

---

## 📊 Sơ Đồ Trạng Thái

### Application Status Flow

```
submitted ──accept──→ accepted ──submit──→ in_review ──┬─→ completed (approve)
                                                        │
                                                        └─→ needs_revision
                                                             │
                                                             └─resubmit─→ completed (auto)
```

### Task Status Flow

```
open ──accept──→ in_progress ──submit──→ in_review ──┬─→ completed
                                                      │
                                                      └─→ (stays in_review)
                                                           │
                                                           └─resubmit─→ completed (auto)
```

---

## 🔔 Notifications Timeline

### Happy Path (Approve ngay)

1. Employer tạo task → **#1** `task_created` (public)
2. Freelancer apply → **#2** `application_received` (employer)
3. Employer accept → **#3** `application_accepted` (freelancer)
4. Freelancer submit → **#4** `task_submitted` (employer)
5. Employer approve + rate → **#6** `task_approved` (freelancer)
6. Employer approve + rate → **#8** `task_rated` (freelancer)

### Revision Path

1-3. (Giống happy path)
4. Freelancer submit lần 1 → **#4** `task_submitted` (employer)
5. Employer request revision → **#5** `task_needs_revision` (freelancer)
6. Freelancer resubmit → **#4** `task_submitted` (employer)
7. Auto-approve → **#6** `task_approved` (freelancer)
8. Auto-approve → **#7** `rating_reminder` (employer)
9. Employer rate → **#8** `task_rated` (freelancer)

---

## 📁 Files Đã Thay Đổi

### Code Changes

1. ✅ `src/db/schema.ts` - Thêm `submissionCount` field
2. ✅ `src/routes/taskApplications.ts` - Thêm endpoint `POST /:id/submit`

### Documentation

3. ✅ `tests/postman/TESTING_GUIDE_VN.md` - Hướng dẫn đầy đủ (tiếng Việt)
4. ✅ `tests/postman/QUICK_START_VN.md` - Quick start 5 phút
5. ✅ `tests/postman/Slice_API_Submit_Tests.postman_collection.json` - Test collection mới
6. ✅ `tests/postman/README.md` - Update thông báo

### Database

7. ✅ `migrations/002_add_submission_count.sql` - Migration SQL

---

## 🚀 Triển Khai

### Bước 1: Chạy Migration

```bash
psql -U postgres -d slice_db -f migrations/002_add_submission_count.sql
```

Hoặc nếu dùng migration tool:
```bash
npm run migrate
# hoặc
drizzle-kit push:pg
```

### Bước 2: Restart Server

```bash
npm run dev
```

### Bước 3: Test

#### Option A: Postman GUI
1. Import `Slice_API_Submit_Tests.postman_collection.json`
2. Chọn environment "Slice API - Local"
3. Chạy collection

#### Option B: Quick Manual Test
```bash
# 1. Tạo task và application
# 2. Accept application
# 3. Submit outcome
curl -X POST http://127.0.0.1:3000/applications/1/submit \
  -H "Authorization: Bearer test_freelancer_001" \
  -H "Content-Type: application/json" \
  -d '{"outcome":"Test outcome","outcomeType":"text"}'

# Verify: application.status = "in_review"
```

---

## ✅ Checklist Triển Khai

- [ ] Backup database
- [ ] Chạy migration SQL
- [ ] Verify column đã được thêm: `\d task_applications`
- [ ] Restart server
- [ ] Test endpoint submit bằng Postman
- [ ] Verify flow: submit lần 1 → in_review
- [ ] Verify flow: resubmit → completed
- [ ] Check notifications được gửi đúng
- [ ] Update Postman collection cho team
- [ ] Thông báo cho Frontend team về endpoint mới

---

## 🐛 Troubleshooting

### Lỗi: Column không tồn tại

```
ERROR: column "submission_count" does not exist
```

**Giải pháp:** Chạy migration SQL

---

### Lỗi: 400 "Cannot submit outcome in current application status"

**Nguyên nhân:** Application không ở trạng thái hợp lệ

**Kiểm tra:**
```sql
SELECT id, status FROM task_applications WHERE id = <APP_ID>;
```

**Trạng thái hợp lệ:** `accepted`, `submitted`, `needs_revision`

---

### Lỗi: 403 Forbidden

**Nguyên nhân:** Chỉ applicant mới được submit

**Kiểm tra:** Đảm bảo dùng đúng token (freelancer token)

---

## 📞 Support

**Tài liệu chi tiết:**
- `tests/postman/TESTING_GUIDE_VN.md` - Hướng dẫn từng bước
- `tests/postman/QUICK_START_VN.md` - Quick start 5 phút

**Test examples:**
- Collection: `Slice_API_Submit_Tests.postman_collection.json`

---

**Cập nhật:** 11/11/2025  
**Version:** 2.0
