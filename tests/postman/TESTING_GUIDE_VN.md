# 🧪 Hướng Dẫn Kiểm Thử API - Slice Jobs Platform

Tài liệu này hướng dẫn chi tiết cách kiểm thử toàn bộ API theo đúng luồng hoạt động thực tế của nền tảng SocialFi Jobs.

---

## 📋 Mục Lục

1. [Chuẩn Bị](#chuẩn-bị)
2. [Luồng Hoạt Động Chính](#luồng-hoạt-động-chính)
3. [Chi Tiết Từng Bước Kiểm Thử](#chi-tiết-từng-bước-kiểm-thử)
4. [Các Trường Hợp Đặc Biệt](#các-trường-hợp-đặc-biệt)
5. [Kiểm Tra Thông Báo](#kiểm-tra-thông-báo)
6. [Troubleshooting](#troubleshooting)

---

## 🎯 Chuẩn Bị

### Bước 1: Import Collection và Environment

1. **Mở Postman**
2. **Import Collection**:
   - File → Import
   - Chọn file: `tests/postman/Slice_API_Collection.postman_collection.json`
   
3. **Import Environment**:
   - Click biểu tượng Environment (góc trên bên phải)
   - Import
   - Chọn file: `tests/postman/Slice_API_Local.postman_environment.json`

4. **Chọn Environment "Slice API - Local"** từ dropdown

### Bước 2: Khởi Động Server

```bash
# Chạy trong terminal
npm run dev
# hoặc
npx vercel dev
```

Đảm bảo server chạy tại `http://127.0.0.1:3000`

### Bước 3: Cấu Hình Authentication

**Option A: Bypass Authentication (Dễ nhất cho testing local)**
- Server sẽ tự động accept token `test_employer_001` và `test_freelancer_001`
- Environment đã có sẵn các token này

**Option B: Dùng JWT thật từ Lens Protocol**
- Lấy JWT token từ Lens API
- Update các biến `EMPLOYER_JWT` và `FREELANCER_JWT` trong environment

---

## 🔄 Luồng Hoạt Động Chính

### Tóm Tắt Flow

```
1. Employer tạo Task
2. Freelancer apply vào Task  
3. Employer accept Application (chọn freelancer)
4. Freelancer submit outcome lần 1 → Task vào trạng thái IN_REVIEW
5. Employer có 2 lựa chọn:
   a) Approve ngay → Task COMPLETED
   b) Request revision → Task NEEDS_REVISION
6. Nếu needs_revision:
   - Freelancer submit outcome lần 2 → TỰ ĐỘNG COMPLETED
7. Employer đánh giá (rate) freelancer
```

### Sơ Đồ Trạng Thái

**Task Status:**
```
open → in_progress → in_review → completed/cancelled
                   ↓ (needs_revision)
                   ← (resubmit) → completed
```

**Application Status:**
```
submitted → accepted → in_review → completed/needs_revision
                     ↓ (needs_revision)
                     → (resubmit) → completed
```

---

## 📝 Chi Tiết Từng Bước Kiểm Thử

### **BƯỚC 1: Tạo Users**

#### 1.1 - Tạo Employer

**Endpoint:** `POST /users`  
**Auth:** Không cần  
**Body:**
```json
{
  "profileId": "test_employer_001",
  "username": "employer_test",
  "reputationScore": 100,
  "rewardPoints": 1000,
  "level": 5,
  "professionalRoles": ["Product Manager", "Project Manager"]
}
```

**Kết Quả Mong Đợi:**
- ✅ Status: `201 Created`
- ✅ Response chứa user ID
- ✅ `profileId` = "test_employer_001"

---

#### 1.2 - Tạo Freelancer

**Endpoint:** `POST /users`  
**Auth:** Không cần  
**Body:**
```json
{
  "profileId": "test_freelancer_001",
  "username": "freelancer_test",
  "reputationScore": 90,
  "rewardPoints": 500,
  "level": 3,
  "professionalRoles": ["Frontend Developer", "UI Designer"]
}
```

**Kết Quả Mong Đợi:**
- ✅ Status: `201 Created`
- ✅ Response chứa user ID
- ✅ `profileId` = "test_freelancer_001"

---

### **BƯỚC 2: Employer Tạo Task**

**Endpoint:** `POST /tasks`  
**Auth:** Bearer `{{EMPLOYER_JWT}}`  
**Headers:**
```
Authorization: Bearer test_employer_001
```

**Body:**
```json
{
  "title": "Thiết kế Landing Page cho DApp",
  "objective": "Cần thiết kế một landing page chuyên nghiệp cho ứng dụng DeFi",
  "deliverables": "File Figma design, exported PNG/SVG assets",
  "acceptanceCriteria": "Design phải responsive, tuân thủ brand guideline, có dark mode",
  "rewardPoints": 500,
  "deadline": "2025-12-31T23:59:59Z"
}
```

**Kết Quả Mong Đợi:**
- ✅ Status: `201 Created`
- ✅ `task.status` = "open"
- ✅ `task.employerProfileId` = "test_employer_001"
- ✅ Response trả về `task.id` → **LƯU LẠI** (dùng cho các bước sau)

**Test Script (Postman):**
```javascript
pm.test("Task created successfully", function () {
    pm.response.to.have.status(201);
    var jsonData = pm.response.json();
    pm.expect(jsonData.status).to.eql("open");
    pm.environment.set("TASK_ID", jsonData.id);
});
```

**Thông Báo Được Gửi:**
- 🔔 **Notification #1**: `task_created` → Gửi cho tất cả users (public)

---

### **BƯỚC 3: Freelancer Apply Vào Task**

**Endpoint:** `POST /applications`  
**Auth:** Bearer `{{FREELANCER_JWT}}`  
**Headers:**
```
Authorization: Bearer test_freelancer_001
```

**Body:**
```json
{
  "taskId": {{TASK_ID}},
  "coverLetter": "Tôi có 5 năm kinh nghiệm thiết kế UI/UX cho các DApp. Portfolio: https://example.com"
}
```

**Kết Quả Mong Đợi:**
- ✅ Status: `201 Created`
- ✅ `application.status` = "submitted"
- ✅ `application.applicantProfileId` = "test_freelancer_001"
- ✅ Response trả về `application.id` → **LƯU LẠI**

**Test Script:**
```javascript
pm.test("Application submitted", function () {
    pm.response.to.have.status(201);
    var jsonData = pm.response.json();
    pm.expect(jsonData.status).to.eql("submitted");
    pm.environment.set("APP_ID", jsonData.id);
});
```

**Thông Báo Được Gửi:**
- 🔔 **Notification #2**: `application_received` → Gửi cho Employer

---

### **BƯỚC 4: Employer Accept Application**

**Endpoint:** `PUT /applications/{{APP_ID}}`  
**Auth:** Bearer `{{EMPLOYER_JWT}}`  
**Headers:**
```
Authorization: Bearer test_employer_001
```

**Body:**
```json
{
  "status": "accepted"
}
```

**Kết Quả Mong Đợi:**
- ✅ Status: `200 OK`
- ✅ `application.status` = "accepted"
- ✅ `task.status` = "in_progress"
- ✅ `task.freelancerProfileId` = "test_freelancer_001"

**Test Script:**
```javascript
pm.test("Application accepted", function () {
    pm.response.to.have.status(200);
    var jsonData = pm.response.json();
    pm.expect(jsonData.status).to.eql("accepted");
});
```

**Thông Báo Được Gửi:**
- 🔔 **Notification #3**: `application_accepted` → Gửi cho Freelancer

---

### **BƯỚC 5: Freelancer Submit Outcome Lần 1**

**⭐ ENDPOINT MỚI ⭐**

**Endpoint:** `POST /applications/{{APP_ID}}/submit`  
**Auth:** Bearer `{{FREELANCER_JWT}}`  
**Headers:**
```
Authorization: Bearer test_freelancer_001
```

**Body:**
```json
{
  "outcome": "Figma link: https://figma.com/file/xyz\nĐã complete 90% requirements",
  "outcomeType": "text"
}
```

**Kết Quả Mong Đợi:**
- ✅ Status: `200 OK`
- ✅ `application.status` = "in_review"
- ✅ `task.status` = "in_review"
- ✅ `application.outcome` được lưu
- ✅ Message: "Submission received and set to in_review"

**Test Script:**
```javascript
pm.test("First submission successful", function () {
    pm.response.to.have.status(200);
    var jsonData = pm.response.json();
    pm.expect(jsonData.application.status).to.eql("in_review");
});
```

**Thông Báo Được Gửi:**
- 🔔 **Notification #4**: `task_submitted` → Gửi cho Employer

---

### **BƯỚC 6A: Employer Approve Ngay (Happy Path)**

**Endpoint:** `PUT /applications/{{APP_ID}}`  
**Auth:** Bearer `{{EMPLOYER_JWT}}`  
**Body:**
```json
{
  "status": "completed",
  "rating": 5,
  "comment": "Công việc xuất sắc! Design rất chuyên nghiệp."
}
```

**Kết Quả Mong Đợi:**
- ✅ Status: `200 OK`
- ✅ `application.status` = "completed"
- ✅ `task.status` = "completed"
- ✅ `application.completedAt` có giá trị
- ✅ `application.rating` = 5

**Thông Báo Được Gửi:**
- 🔔 **Notification #6**: `task_approved` → Gửi cho Freelancer
- 🔔 **Notification #8**: `task_rated` → Gửi cho Freelancer (vì có rating)

**➡️ Kết thúc flow tại đây nếu approve ngay**

---

### **BƯỚC 6B: Employer Request Revision (Revision Path)**

**Endpoint:** `PUT /applications/{{APP_ID}}`  
**Auth:** Bearer `{{EMPLOYER_JWT}}`  
**Body:**
```json
{
  "status": "needs_revision",
  "feedback": "Design tốt nhưng cần điều chỉnh: \n1. Thêm dark mode\n2. Responsive cho mobile\n3. Cập nhật color scheme"
}
```

**Kết Quả Mong Đợi:**
- ✅ Status: `200 OK`
- ✅ `application.status` = "needs_revision"
- ✅ `application.feedback` được lưu
- ✅ `task.status` vẫn là "in_review"

**Test Script:**
```javascript
pm.test("Revision requested", function () {
    pm.response.to.have.status(200);
    var jsonData = pm.response.json();
    pm.expect(jsonData.status).to.eql("needs_revision");
});
```

**Thông Báo Được Gửi:**
- 🔔 **Notification #5**: `task_needs_revision` → Gửi cho Freelancer

---

### **BƯỚC 7: Freelancer Submit Outcome Lần 2 (Resubmit)**

**⭐ TỰ ĐỘNG APPROVE ⭐**

**Endpoint:** `POST /applications/{{APP_ID}}/submit`  
**Auth:** Bearer `{{FREELANCER_JWT}}`  
**Body:**
```json
{
  "outcome": "Đã cập nhật:\n✓ Thêm dark mode\n✓ Responsive mobile\n✓ Color scheme mới\nFigma: https://figma.com/file/xyz-v2",
  "outcomeType": "text"
}
```

**Kết Quả Mong Đợi:**
- ✅ Status: `200 OK`
- ✅ `application.status` = "completed" (⭐ TỰ ĐỘNG)
- ✅ `task.status` = "completed" (⭐ TỰ ĐỘNG)
- ✅ `application.submissionCount` = 1
- ✅ `application.completedAt` có giá trị
- ✅ Message: "Resubmission accepted and application completed"

**Test Script:**
```javascript
pm.test("Resubmission auto-approved", function () {
    pm.response.to.have.status(200);
    var jsonData = pm.response.json();
    pm.expect(jsonData.application.status).to.eql("completed");
    pm.expect(jsonData.application.submissionCount).to.eql(1);
});
```

**Thông Báo Được Gửi:**
- 🔔 **Notification #4**: `task_submitted` → Gửi cho Employer
- 🔔 **Notification #6**: `task_approved` → Gửi cho Freelancer
- 🔔 **Notification #7**: `rating_reminder` → Gửi cho Employer

---

### **BƯỚC 8: Employer Đánh Giá (Rate) - Optional**

**Endpoint:** `POST /applications/{{APP_ID}}/rate`  
**Auth:** Bearer `{{EMPLOYER_JWT}}`  
**Body:**
```json
{
  "rating": 5,
  "comment": "Freelancer rất chuyên nghiệp, responsive feedback nhanh chóng!"
}
```

**Kết Quả Mong Đợi:**
- ✅ Status: `200 OK`
- ✅ `application.rating` = 5
- ✅ `application.comment` được lưu

**Thông Báo Được Gửi:**
- 🔔 **Notification #8**: `task_rated` → Gửi cho Freelancer

**Lưu Ý:**
- Chỉ có thể rate khi `application.status = "completed"`
- Nếu đã rate trong bước 6A thì không cần bước này

---

### **BƯỚC 9: Kiểm Tra Notifications**

#### 9.1 - Lấy Tất Cả Notifications (Freelancer)

**Endpoint:** `GET /notifications`  
**Auth:** Bearer `{{FREELANCER_JWT}}`

**Kết Quả Mong Đợi:**
- ✅ Danh sách notifications của freelancer:
  - `application_accepted` (#3)
  - `task_needs_revision` (#5) - nếu có revision
  - `task_approved` (#6)
  - `task_rated` (#8)

---

#### 9.2 - Lấy Unread Notifications

**Endpoint:** `GET /notifications/unread`  
**Auth:** Bearer `{{FREELANCER_JWT}}`

**Kết Quả Mong Đợi:**
- ✅ Chỉ notifications chưa đọc (`isRead = 0`)

---

#### 9.3 - Đánh Dấu Notification Là Đã Đọc

**Endpoint:** `PUT /notifications/{{NOTIF_ID}}/read`  
**Auth:** Bearer `{{FREELANCER_JWT}}`

**Kết Quả Mong Đợi:**
- ✅ Status: `200 OK`
- ✅ `notification.isRead` = 1

---

#### 9.4 - Đánh Dấu Tất Cả Là Đã Đọc

**Endpoint:** `PUT /notifications/read-all`  
**Auth:** Bearer `{{FREELANCER_JWT}}`

**Kết Quả Mong Đợi:**
- ✅ Status: `200 OK`
- ✅ Tất cả notifications của user được đánh dấu đã đọc

---

## 🎭 Các Trường Hợp Đặc Biệt

### Case 1: Employer Reject Application

**Endpoint:** `PUT /applications/{{APP_ID}}`  
**Auth:** Bearer `{{EMPLOYER_JWT}}`  
**Body:**
```json
{
  "status": "rejected"
}
```

**Kết Quả:**
- ✅ `application.status` = "rejected"
- ✅ `task.status` vẫn là "open" (có thể accept applicant khác)
- 🔔 **Notification #9**: `application_rejected` → Gửi cho Freelancer

---

### Case 2: Duplicate Application

**Scenario:** Freelancer thử apply lại vào task đã apply

**Endpoint:** `POST /applications`  
**Auth:** Bearer `{{FREELANCER_JWT}}`  
**Body:** (cùng taskId)

**Kết Quả:**
- ✅ Status: `400 Bad Request`
- ✅ Error: "You have already applied for this task"

---

### Case 3: Submit Outcome Khi Chưa Được Accept

**Scenario:** Freelancer thử submit outcome khi application vẫn ở trạng thái "submitted"

**Endpoint:** `POST /applications/{{APP_ID}}/submit`  
**Auth:** Bearer `{{FREELANCER_JWT}}`

**Kết Quả:**
- ✅ Status: `200 OK` (vẫn cho submit)
- ✅ `application.status` = "in_review"
- ✅ Employer được notify

**Lưu Ý:** Logic cho phép freelancer submit ngay cả khi status = "submitted"

---

### Case 4: Xóa Task Có Applications

**Endpoint:** `DELETE /tasks/{{TASK_ID}}`  
**Auth:** Bearer `{{EMPLOYER_JWT}}`

**Kết Quả:**
- ✅ `task.status` = "cancelled" (KHÔNG XÓA)
- ✅ Applications vẫn còn trong DB
- ✅ Có thể retrieve lại task và applications

---

### Case 5: Xóa Task Không Có Applications

**Endpoint:** `DELETE /tasks/{{TASK_ID}}`  
**Auth:** Bearer `{{EMPLOYER_JWT}}`

**Kết Quả:**
- ✅ Task bị XÓA VĨNH VIỄN khỏi DB
- ✅ Status: `200 OK`

---

## 📊 Bảng Tổng Hợp Notifications

| # | Type | Trigger | Recipient | Timing |
|---|------|---------|-----------|--------|
| 1 | `task_created` | Employer tạo task | Public/All | Ngay lập tức |
| 2 | `application_received` | Freelancer apply | Employer | Ngay lập tức |
| 3 | `application_accepted` | Employer accept | Freelancer | Ngay lập tức |
| 4 | `task_submitted` | Freelancer submit outcome | Employer | Ngay lập tức |
| 5 | `task_needs_revision` | Employer request revision | Freelancer | Ngay lập tức |
| 6 | `task_approved` | Task completed (auto hoặc manual) | Freelancer | Ngay lập tức |
| 7 | `rating_reminder` | Task completed mà chưa rate | Employer | Ngay lập tức |
| 8 | `task_rated` | Employer rate | Freelancer | Ngay lập tức |
| 9 | `application_rejected` | Employer reject | Freelancer | Ngay lập tức |

---

## 🔍 Kiểm Tra Database

### Kiểm Tra Task Status

```sql
SELECT id, title, status, employer_profile_id, freelancer_profile_id 
FROM tasks 
WHERE id = <TASK_ID>;
```

**Kết Quả Mong Đợi:**
- Sau accept: `status = 'in_progress'`, `freelancer_profile_id` có giá trị
- Sau submit lần 1: `status = 'in_review'`
- Sau completed: `status = 'completed'`

---

### Kiểm Tra Application Status

```sql
SELECT id, task_id, status, submission_count, outcome, completed_at, rating 
FROM task_applications 
WHERE id = <APP_ID>;
```

**Kết Quả Mong Đợi:**
- Sau apply: `status = 'submitted'`, `submission_count = 0`
- Sau accept: `status = 'accepted'`
- Sau submit lần 1: `status = 'in_review'`, `outcome` có giá trị
- Sau needs_revision: `status = 'needs_revision'`
- Sau resubmit: `status = 'completed'`, `submission_count = 1`

---

### Kiểm Tra Notifications

```sql
SELECT id, user_profile_id, type, title, is_read 
FROM notifications 
WHERE user_profile_id IN ('test_employer_001', 'test_freelancer_001')
ORDER BY created_at DESC;
```

**Kết Quả Mong Đợi:**
- Employer nhận: #2, #4, #7
- Freelancer nhận: #3, #5, #6, #8 (hoặc #9 nếu bị reject)

---

## 🛠️ Troubleshooting

### Lỗi 401 Unauthorized

**Nguyên nhân:**
- Token không hợp lệ hoặc thiếu header Authorization

**Giải pháp:**
1. Kiểm tra biến `EMPLOYER_JWT` / `FREELANCER_JWT` trong environment
2. Đảm bảo server đang chạy ở chế độ bypass auth (cho testing)
3. Kiểm tra header request có `Authorization: Bearer <token>`

---

### Lỗi 404 Not Found

**Nguyên nhân:**
- ID không tồn tại trong database
- Biến environment chưa được set

**Giải pháo:**
1. Kiểm tra `{{TASK_ID}}` và `{{APP_ID}}` đã được lưu từ bước trước
2. Chạy lại từ đầu theo đúng thứ tự các bước
3. Verify trong database: `SELECT * FROM tasks WHERE id = <ID>;`

---

### Lỗi 400 Bad Request - "Cannot submit outcome in current application status"

**Nguyên nhân:**
- Application không ở trạng thái cho phép submit (accepted, submitted, needs_revision)

**Giải pháp:**
1. Kiểm tra `application.status` hiện tại
2. Nếu status = "submitted": Employer cần accept trước
3. Nếu status = "completed": Không thể submit lại
4. Nếu status = "rejected": Task đã bị reject

---

### Lỗi 403 Forbidden

**Nguyên nhân:**
- User không có quyền thực hiện action này
- Ví dụ: Freelancer thử update application của employer

**Giải pháp:**
1. Kiểm tra đang dùng đúng token (employer/freelancer)
2. Employer chỉ được: create task, accept/reject/approve
3. Freelancer chỉ được: apply, submit outcome

---

### Notification Không Được Tạo

**Nguyên nhân:**
- Lỗi trong notification service
- Database constraint violation

**Giải pháp:**
1. Kiểm tra server logs
2. Verify foreign keys (task_id, user_profile_id) hợp lệ
3. Chạy query: `SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10;`

---

## ✅ Checklist Kiểm Thử Hoàn Chỉnh

### Happy Path (Approve Ngay)
- [ ] Tạo employer user
- [ ] Tạo freelancer user
- [ ] Employer tạo task → task.status = "open"
- [ ] Freelancer apply → application.status = "submitted"
- [ ] Employer accept → application.status = "accepted", task.status = "in_progress"
- [ ] Freelancer submit outcome lần 1 → application.status = "in_review", task.status = "in_review"
- [ ] Employer approve + rate → application.status = "completed", task.status = "completed"
- [ ] Freelancer nhận 3 notifications: #3, #6, #8
- [ ] Employer nhận 2 notifications: #2, #4

### Revision Path (Cần Chỉnh Sửa)
- [ ] Tạo users và task (như trên)
- [ ] Freelancer apply và được accept
- [ ] Freelancer submit outcome lần 1 → in_review
- [ ] Employer request revision → application.status = "needs_revision"
- [ ] Freelancer submit outcome lần 2 → **TỰ ĐỘNG** completed
- [ ] Employer rate (optional)
- [ ] Freelancer nhận 4 notifications: #3, #5, #6, #8
- [ ] Employer nhận 3 notifications: #2, #4 (x2), #7

### Rejection Path
- [ ] Freelancer apply
- [ ] Employer reject → application.status = "rejected"
- [ ] Freelancer nhận notification #9
- [ ] Task.status vẫn là "open"

### Edge Cases
- [ ] Duplicate application → Error 400
- [ ] Xóa task có applications → task.status = "cancelled"
- [ ] Xóa task không có applications → Xóa vĩnh viễn
- [ ] Submit outcome khi chưa accept → Vẫn OK
- [ ] Rate khi chưa completed → Error 400

---

## 🚀 Chạy Automation Test

### Sử dụng Postman Collection Runner

1. Click collection "Slice API - Complete Flow Test"
2. Click nút "Run"
3. Chọn environment "Slice API - Local"
4. Chọn tất cả requests hoặc chọn folder cụ thể
5. Click "Run Slice API..."

**Kết Quả:**
- Tất cả tests pass → ✅ GREEN
- Report hiển thị số requests passed/failed

---

### Sử dụng Newman CLI

```bash
# Install Newman
npm install -g newman

# Run full collection
newman run tests/postman/Slice_API_Collection.postman_collection.json \
  -e tests/postman/Slice_API_Local.postman_environment.json \
  --reporters cli,html \
  --reporter-html-export test-results.html
```

**Kết Quả:**
- Terminal hiển thị kết quả real-time
- File `test-results.html` chứa báo cáo chi tiết

---

### Sử dụng Automation Script

**Linux/Mac:**
```bash
chmod +x tests/scripts/test-full-flow.sh
./tests/scripts/test-full-flow.sh http://127.0.0.1:3000
```

**Windows (PowerShell):**
```powershell
.\tests\scripts\test-full-flow.ps1 http://127.0.0.1:3000
```

---

## 📚 Tài Liệu Tham Khảo

- **API Flow Diagram**: `docs/API_FLOW.md`
- **Postman Collection**: `tests/postman/Slice_API_Collection.postman_collection.json`
- **Environment File**: `tests/postman/Slice_API_Local.postman_environment.json`
- **Manual Test Cases**: `tests/manual/test-scenarios.md`
- **Edge Cases**: `tests/manual/edge-cases.md`

---

## 🎯 Kết Luận

Tài liệu này cung cấp hướng dẫn chi tiết để kiểm thử toàn bộ API theo đúng luồng nghiệp vụ. 

**Lưu Ý Quan Trọng:**
1. **Endpoint Submit Mới**: `POST /applications/:id/submit` - Dùng để freelancer nộp outcome
2. **Auto-Approve**: Submit lần 2 sau needs_revision sẽ TỰ ĐỘNG complete
3. **9 Loại Notifications**: Kiểm tra đầy đủ tất cả notifications được gửi đúng timing

**Liên Hệ:**
- Nếu gặp vấn đề, check server logs: `console.log` trong terminal
- Verify database state: Chạy SQL queries để kiểm tra

---

**Cập nhật:** 11/11/2025  
**Phiên bản:** 2.0 (có endpoint submit)
