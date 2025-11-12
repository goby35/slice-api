# 📚 API Flow Documentation - SocialFi Jobs (Web2.5 Hybrid)

## 🎯 Tổng Quan Flow

Hệ thống này triển khai **9 loại thông báo** và flow tự động xử lý task application theo UML diagram.

---

## 🔄 Flow Hoàn Chỉnh

### **1️⃣ ĐĂNG TASK**
```
Employer → POST /tasks
├─ Tạo task (status='open')
├─ Tạo checklist items (nếu có)
└─ [Thông báo #1] task_created → Public/Group
```

**Request:**
```json
POST /tasks
Authorization: Bearer <JWT_TOKEN>
{
  "title": "Build Landing Page",
  "objective": "Create a modern landing page",
  "deliverables": "Responsive HTML/CSS/JS",
  "acceptanceCriteria": "Mobile-friendly, < 3s load time",
  "rewardPoints": 500,
  "deadline": "2025-12-31T23:59:59Z",
  "checklist": [
    { "itemText": "Design mockup", "orderIndex": 0 },
    { "itemText": "Implement responsive layout", "orderIndex": 1 }
  ]
}
```

---

### **2️⃣ ỨNG TUYỂN / SUBMIT LẦN 1**
```
Freelancer → POST /applications
├─ Tạo application (status='submitted')
├─ Cập nhật task (status='in_review')
└─ [Thông báo #2] application_received → Employer
```

**Request:**
```json
POST /applications
Authorization: Bearer <JWT_TOKEN>
{
  "taskId": 123,
  "coverLetter": "I have 5 years experience..."
}
```

---

### **3️⃣ EMPLOYER XỬ LÝ (4 Options)**

#### **Option A: Yêu cầu chỉnh sửa**
```
Employer → PUT /applications/:id
├─ Update status='needs_revision'
└─ [Thông báo #5] task_needs_revision → Freelancer
```

**Request:**
```json
PUT /applications/456
Authorization: Bearer <JWT_TOKEN>
{
  "status": "needs_revision",
  "feedback": "Please add mobile responsiveness"
}
```

#### **Option B: Chấp nhận ứng tuyển**
```
Employer → PUT /applications/:id
├─ Update application (status='accepted')
├─ Update task (freelancerProfileId, status='in_progress')
└─ [Thông báo #3] application_accepted → Freelancer
```

**Request:**
```json
PUT /applications/456
Authorization: Bearer <JWT_TOKEN>
{
  "status": "accepted"
}
```

#### **Option C: Duyệt + Đánh giá ngay**
```
Employer → PUT /applications/:id
├─ Update application (status='completed', rating, comment)
├─ Update task (status='completed')
├─ [Thông báo #6] task_approved → Freelancer
└─ [Thông báo #8] task_rated → Freelancer
```

**Request:**
```json
PUT /applications/456
Authorization: Bearer <JWT_TOKEN>
{
  "status": "completed",
  "rating": 5,
  "comment": "Excellent work!"
}
```

#### **Option D: Từ chối ứng tuyển**
```
Employer → PUT /applications/:id
├─ Update application (status='rejected')
└─ [Thông báo #9] application_rejected → Freelancer
```

**Request:**
```json
PUT /applications/456
Authorization: Bearer <JWT_TOKEN>
{
  "status": "rejected"
}
```

---

### **4️⃣ SUBMIT LẦN 2 → HỆ THỐNG TỰ ĐỘNG DUYỆT**
```
Freelancer → POST /applications (submit lại)
├─ Phát hiện status='needs_revision'
├─ HỆ THỐNG tự động: status='completed'
├─ Update task (status='completed')
├─ [Thông báo #4] task_submitted → Employer
└─ [Thông báo #7] rating_reminder → Employer
```

**Logic tự động:**
- Nếu application có status `needs_revision`
- Khi Freelancer POST lại → Hệ thống tự động chuyển sang `completed`
- Nhắc Employer đánh giá

---

### **5️⃣ ĐÁNH GIÁ SAU (Optional)**
```
Employer → POST /applications/:id/rate
├─ Update application (rating, comment)
└─ [Thông báo #8] task_rated → Freelancer
```

**Request:**
```json
POST /applications/456/rate
Authorization: Bearer <JWT_TOKEN>
{
  "rating": 4,
  "comment": "Good job, minor improvements needed"
}
```

---

### **6️⃣ HỦY TASK**
```
Employer → DELETE /tasks/:id
├─ Kiểm tra: có application nào không?
├─ Nếu có → status='cancelled'
└─ Nếu không → Xóa luôn
```

**Response khi có applications:**
```json
{
  "message": "Task cancelled successfully (has applications)",
  "task": { "id": 123, "status": "cancelled" }
}
```

---

### **7️⃣ XEM THÔNG BÁO**
```
User → GET /notifications
└─ Trả về danh sách thông báo (sorted by createdAt DESC)
```

**Response:**
```json
[
  {
    "id": 1,
    "type": "application_received",
    "title": "Ứng tuyển mới",
    "message": "john_doe đã ứng tuyển công việc: Build Landing Page",
    "relatedTaskId": 123,
    "relatedApplicationId": 456,
    "isRead": 0,
    "createdAt": "2025-11-10T10:30:00Z"
  }
]
```

---

## 📋 9 LOẠI THÔNG BÁO

| # | Type | Gửi đến | Khi nào |
|---|------|---------|---------|
| 1 | `task_created` | Public/Group | Task mới được tạo |
| 2 | `application_received` | Employer | Freelancer ứng tuyển |
| 3 | `application_accepted` | Freelancer | Employer chấp nhận |
| 4 | `task_submitted` | Employer | Freelancer nộp lại sau revision |
| 5 | `task_needs_revision` | Freelancer | Employer yêu cầu sửa |
| 6 | `task_approved` | Freelancer | Task được duyệt hoàn thành |
| 7 | `rating_reminder` | Employer | Nhắc đánh giá sau auto-approve |
| 8 | `task_rated` | Freelancer | Employer đã đánh giá |
| 9 | `application_rejected` | Freelancer | Employer từ chối ứng tuyển |

---

## 🗄️ DATABASE SCHEMA

### **tasks**
- `status`: `'open' | 'in_review' | 'in_progress' | 'completed' | 'cancelled'`

### **task_applications**
- `status`: `'submitted' | 'accepted' | 'rejected' | 'needs_revision' | 'completed'`
- `feedback`: Feedback khi needs_revision
- `rating`: 1-5 stars
- `comment`: Comment đánh giá
- `completedAt`: Timestamp hoàn thành

### **task_checklists**
- `taskId`: Foreign key to tasks
- `itemText`: Nội dung checklist
- `isCompleted`: 0 hoặc 1
- `orderIndex`: Thứ tự hiển thị

### **notifications**
- `type`: 1 trong 8 loại thông báo
- `userProfileId`: Người nhận
- `relatedTaskId`, `relatedApplicationId`: Links
- `isRead`: 0 hoặc 1

---

## 🔐 AUTHENTICATION

Tất cả các endpoint quan trọng đều yêu cầu JWT token:
```
Authorization: Bearer <JWT_TOKEN>
```

ProfileId được extract từ JWT: `userPayload.act.sub || userPayload.sub`

---

## 🚀 API ENDPOINTS SUMMARY

### Tasks
- `GET /tasks` - Lấy danh sách tasks
- `POST /tasks` 🔐 - Tạo task mới (+ checklist)
- `GET /tasks/:id` - Chi tiết task (+ checklist)
- `PUT /tasks/:id` - Cập nhật task
- `DELETE /tasks/:id` 🔐 - Xóa/Hủy task

### Applications
- `GET /applications` - Lấy tất cả applications
- `GET /applications/task/:taskId` - Applications của 1 task
- `POST /applications` 🔐 - Ứng tuyển / Submit lại
- `PUT /applications/:id` 🔐 - Employer xử lý (accept/reject/needs_revision/completed)
- `POST /applications/:id/rate` 🔐 - Đánh giá sau
- `DELETE /applications/:id` 🔐 - Xóa application

### Notifications
- `GET /notifications` 🔐 - Lấy danh sách thông báo
- `GET /notifications/unread` 🔐 - Đếm chưa đọc
- `PUT /notifications/:id/read` 🔐 - Đánh dấu đã đọc
- `PUT /notifications/read-all` 🔐 - Đánh dấu tất cả đã đọc
- `DELETE /notifications/:id` 🔐 - Xóa thông báo

### Users
- `GET /users` - Lấy danh sách users
- `POST /users` - Tạo user mới
- `GET /users/:profileId` - Chi tiết user
- `PUT /users/:profileId` - Cập nhật user
- `DELETE /users/:profileId` - Xóa user
- `POST /users/:profileId/adjust-points` - Cộng/trừ điểm

---

## 🧪 MIGRATION

Chạy migration để tạo bảng mới:
```bash
psql -U postgres -d your_database -f migrations/001_add_notifications_and_checklists.sql
```

Hoặc dùng Drizzle ORM:
```bash
pnpm drizzle-kit push:pg
```

---

## 📝 NOTES

- **Auto-approve logic**: Khi Freelancer submit lại (sau needs_revision), hệ thống tự động duyệt
- **Notifications**: Hiện tại chỉ lưu DB, có thể mở rộng WebSocket/Push
- **Escrow Contract**: Placeholder cho tương lai (Lens Chain integration)
- **Rate limiting**: Áp dụng cho proxy endpoints (/pageview, /posts)

---

## 🔗 RELATED FILES

- `src/db/schema.ts` - Database schema definitions
- `src/services/notificationService.ts` - Notification helpers
- `src/routes/tasks.ts` - Tasks API
- `src/routes/taskApplications.ts` - Applications API
- `src/routes/notifications.ts` - Notifications API
- `migrations/001_add_notifications_and_checklists.sql` - Database migration
