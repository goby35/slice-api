# 🔔 Notification Update - Application Rejected

**Date**: November 10, 2025  
**Update**: Added notification #9 for rejected applications

---

## ✅ Thay Đổi

### Thêm Thông Báo Mới

**#9. application_rejected → Freelancer**
- Gửi đến: Freelancer
- Khi nào: Employer từ chối ứng tuyển
- Tiêu đề: "Ứng tuyển không thành công"
- Nội dung: "Rất tiếc, ứng tuyển của bạn cho công việc '{title}' không được chấp nhận"

---

## 📝 Files Updated

1. **src/db/schema.ts**
   - Thêm `'application_rejected'` vào notification type enum

2. **src/services/notificationService.ts**
   - Thêm function `notifyApplicationRejected()`
   - Cập nhật NotificationType enum

3. **src/routes/taskApplications.ts**
   - Import `notifyApplicationRejected`
   - Gọi notification khi status = 'rejected'

4. **migrations/001_add_notifications_and_checklists.sql**
   - Thêm `'application_rejected'` vào CHECK constraint
   - Cập nhật comment từ 8 → 9 loại thông báo

5. **docs/API_FLOW.md**
   - Cập nhật bảng từ 8 → 9 loại thông báo
   - Thêm Option D: Từ chối ứng tuyển
   - Thêm request example cho reject

6. **CHANGELOG.md**
   - Cập nhật tất cả reference từ 8 → 9 notifications
   - Thêm `notifyApplicationRejected` vào danh sách

7. **README.md**
   - Cập nhật từ 8 → 9 loại thông báo

---

## 🎯 Flow Mới

### Khi Employer từ chối application:

```
Employer → PUT /applications/:id
{
  "status": "rejected"
}

↓

System:
├─ Update application.status = 'rejected'
├─ Create notification (type: 'application_rejected')
└─ Send to Freelancer

↓

Freelancer:
├─ Nhận thông báo "Ứng tuyển không thành công"
└─ Có thể apply task khác
```

---

## 🧪 Testing

Test reject flow:
```bash
# 1. Employer reject application
curl -X PUT "http://localhost:3000/applications/456" \
  -H "Authorization: Bearer <EMPLOYER_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"status": "rejected"}'

# 2. Freelancer check notifications
curl -X GET "http://localhost:3000/notifications" \
  -H "Authorization: Bearer <FREELANCER_JWT>"

# Should see:
# {
#   "type": "application_rejected",
#   "title": "Ứng tuyển không thành công",
#   "message": "Rất tiếc, ứng tuyển của bạn cho công việc '...' không được chấp nhận"
# }
```

---

## 📊 Summary

- **Notification types**: 8 → **9**
- **New function**: `notifyApplicationRejected()`
- **Files updated**: 7
- **Migration needed**: Yes (ALTER TABLE notifications constraint)

---

## 🚀 Migration Command

Nếu đã chạy migration cũ, cần update constraint:

```sql
-- Drop old constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add new constraint with 9 types
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'task_created',
    'application_received',
    'application_accepted',
    'application_rejected',  -- NEW
    'task_submitted',
    'task_needs_revision',
    'task_approved',
    'rating_reminder',
    'task_rated'
  )
);
```

---

## ✅ Complete!

Tất cả 9 loại thông báo đã hoàn tất:
1. ✅ task_created
2. ✅ application_received
3. ✅ application_accepted
4. ✅ task_submitted
5. ✅ task_needs_revision
6. ✅ task_approved
7. ✅ rating_reminder
8. ✅ task_rated
9. ✅ **application_rejected** ← NEW!
