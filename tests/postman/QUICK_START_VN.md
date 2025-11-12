# 🚀 Quick Start - Kiểm Thử API Nhanh

Hướng dẫn nhanh để test API trong 5 phút.

---

## ⚡ Chuẩn Bị (1 phút)

### 1. Import vào Postman

```
File → Import → Chọn 2 files:
├── tests/postman/Slice_API_Collection.postman_collection.json
└── tests/postman/Slice_API_Submit_Tests.postman_collection.json
```

### 2. Import Environment

```
Environments → Import → tests/postman/Slice_API_Local.postman_environment.json
```

### 3. Chọn Environment

Dropdown góc trên bên phải → Chọn **"Slice API - Local"**

---

## 🎬 Test Flow Hoàn Chỉnh (3 phút)

### Bước 1: Tạo Users (30 giây)

**Collection:** Slice API - Complete Flow Test  
**Folder:** 1. Users Management

Chạy 2 requests:
1. ✅ POST /users - Create Employer
2. ✅ POST /users - Create Freelancer

---

### Bước 2: Tạo Task (20 giây)

**Folder:** 2. Tasks Management (Employer)

Chạy:
1. ✅ POST /tasks - Create Task

---

### Bước 3: Apply + Accept (30 giây)

**Folder:** 3. Applications (Freelancer)

Chạy:
1. ✅ POST /applications - Submit Application

**Folder:** 4. Employer Actions

Chạy:
2. ✅ PUT /applications/:id - Accept Application

---

### Bước 4: Submit Outcome Lần 1 (20 giây)

**Collection:** Slice API - Submit Outcome Tests

Chạy:
1. ✅ Freelancer Submit Outcome - First Time

**Kết Quả:**
- Application status = `in_review` ✅
- Task status = `in_review` ✅

---

### Bước 5: Request Revision (20 giây)

**Collection:** Slice API - Complete Flow Test  
**Folder:** 4. Employer Actions

Chạy:
1. ✅ PUT /applications/:id - Request Revision

**Body mẫu:**
```json
{
  "status": "needs_revision",
  "feedback": "Cần thêm dark mode và mobile responsive"
}
```

---

### Bước 6: Resubmit → AUTO COMPLETE (20 giây)

**Collection:** Slice API - Submit Outcome Tests

Chạy:
1. ✅ Freelancer Resubmit After Revision

**Kết Quả:**
- Application status = `completed` ⭐ (TỰ ĐỘNG)
- Task status = `completed` ⭐ (TỰ ĐỘNG)
- submission_count = 1 ✅

---

### Bước 7: Kiểm Tra Notifications (30 giây)

**Collection:** Slice API - Complete Flow Test  
**Folder:** 6. Notifications

Chạy:
1. ✅ GET /notifications - Freelancer Check
2. ✅ GET /notifications/unread

**Kết Quả Mong Đợi:**

Freelancer nhận:
- ✅ application_accepted (#3)
- ✅ task_needs_revision (#5)
- ✅ task_approved (#6)
- ✅ rating_reminder (#7)

---

## 📊 Kết Quả

### ✅ Nếu Thành Công

Tất cả requests trả về status:
- 200 OK hoặc 201 Created
- Không có error

### ❌ Nếu Lỗi

**Lỗi 401 Unauthorized:**
```
→ Kiểm tra token trong Environment
→ Đảm bảo server chạy ở chế độ bypass auth
```

**Lỗi 404 Not Found:**
```
→ Biến {{APP_ID}} hoặc {{TASK_ID}} chưa được lưu
→ Chạy lại từ đầu theo thứ tự
```

**Lỗi 400 Bad Request:**
```
→ Kiểm tra status của application/task
→ Đọc error message để biết lý do
```

---

## 🎯 Test Cases Quan Trọng

### Test Case 1: Happy Path (Approve Ngay)

```
1. Create Task
2. Apply
3. Accept
4. Submit outcome lần 1 → in_review
5. Employer approve → completed
```

**Chạy folder:** 2 → 3 → 4 (Accept) → Submit Tests (First) → 4 (Approve)

---

### Test Case 2: Revision Path (Cần Chỉnh Sửa)

```
1. Create Task
2. Apply
3. Accept
4. Submit outcome lần 1 → in_review
5. Request revision → needs_revision
6. Submit outcome lần 2 → AUTO completed ⭐
```

**Chạy folder:** 2 → 3 → 4 (Accept) → Submit Tests (First) → 4 (Revision) → Submit Tests (Resubmit)

---

### Test Case 3: Rejection Path

```
1. Create Task
2. Apply
3. Reject
```

**Chạy folder:** 2 → 3 → 4 (Reject)

**Kết quả:** Freelancer nhận notification #9 (application_rejected)

---

## 🔄 Run Toàn Bộ Collection

### Option 1: Postman Collection Runner

```
1. Click collection "Slice API - Complete Flow Test"
2. Click nút "Run"
3. Select all folders
4. Click "Run Slice API..."
```

**Thời gian:** ~2-3 phút  
**Kết quả:** Report hiển thị tests passed/failed

---

### Option 2: Newman CLI

```bash
newman run tests/postman/Slice_API_Collection.postman_collection.json \
  -e tests/postman/Slice_API_Local.postman_environment.json \
  --reporters cli,html
```

**Kết quả:** File `test-results.html`

---

## 📝 Các Endpoint Chính

| Method | Endpoint | Dùng Cho | Auth |
|--------|----------|----------|------|
| POST | /tasks | Tạo task | Employer |
| POST | /applications | Apply task | Freelancer |
| PUT | /applications/:id | Accept/Reject/Approve | Employer |
| **POST** | **/applications/:id/submit** | **Submit outcome** ⭐ | **Freelancer** |
| POST | /applications/:id/rate | Đánh giá | Employer |
| GET | /notifications | Xem thông báo | Any |

---

## 🎓 Tips

### 1. Dùng Variables

Environment tự động lưu:
- `{{TASK_ID}}` - ID của task vừa tạo
- `{{APP_ID}}` - ID của application
- `{{EMPLOYER_JWT}}` - Token employer
- `{{FREELANCER_JWT}}` - Token freelancer

### 2. Xem Request Details

Click vào request → Tab "Body" / "Headers" để xem data gửi đi

### 3. Xem Response

Tab "Body" dưới request → JSON response từ server

### 4. Debug

Check tab "Console" (View → Show Postman Console) để xem:
- Request/response details
- console.log từ test scripts
- Network errors

---

## 📚 Tài Liệu Đầy Đủ

Xem chi tiết: `tests/postman/TESTING_GUIDE_VN.md`

---

## ✅ Checklist Nhanh

- [ ] Server đang chạy tại http://127.0.0.1:3000
- [ ] Import 2 collections vào Postman
- [ ] Import environment
- [ ] Chọn environment "Slice API - Local"
- [ ] Chạy "Create Employer" và "Create Freelancer"
- [ ] Chạy flow: Task → Apply → Accept → Submit → Approve/Revision
- [ ] Kiểm tra notifications

---

**Thời gian tổng:** 5 phút  
**Cập nhật:** 11/11/2025
