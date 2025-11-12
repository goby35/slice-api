# 📋 Manual Test Scenarios

Detailed manual test cases for verifying Slice API functionality.

---

## 🎯 Purpose

This document provides step-by-step manual test scenarios to verify:
- API endpoint functionality
- Business logic correctness
- Error handling
- Edge cases
- Notification system
- Data integrity

---

## 🔐 Prerequisites

### Test Users

Create two test users before starting:

**Employer User**:
```json
{
  "profileId": "test_employer_001",
  "displayName": "Test Employer",
  "avatar": "https://avatar.iran.liara.run/public/1",
  "bio": "Test employer account",
  "role": "employer",
  "points": 100
}
```

**Freelancer User**:
```json
{
  "profileId": "test_freelancer_001",
  "displayName": "Test Freelancer",
  "avatar": "https://avatar.iran.liara.run/public/2",
  "bio": "Test freelancer account",
  "role": "freelancer",
  "points": 50
}
```

### Authentication

Set JWT tokens in requests:
- Employer: `Authorization: Bearer test_employer_001`
- Freelancer: `Authorization: Bearer test_freelancer_001`

---

## Test Scenario 1: Task Creation Flow

### TS1.1 - Basic Task Creation

**Objective**: Verify employer can create a task

**Steps**:
1. Login as employer
2. POST `/tasks` with valid data:
   ```json
   {
     "title": "TS1.1 - Simple Task",
     "description": "Test task creation",
     "budget": 100,
     "category": "development"
   }
   ```
3. Verify response

**Expected Result**:
- ✅ Status: 201 Created
- ✅ Response contains task ID
- ✅ Task status is 'open'
- ✅ Employer profile ID matches auth token
- ✅ Database record created

**Pass/Fail**: [ ]

---

### TS1.2 - Task Creation with Checklist

**Objective**: Verify checklist items are saved

**Steps**:
1. Login as employer
2. POST `/tasks` with checklist:
   ```json
   {
     "title": "TS1.2 - Task with Checklist",
     "description": "Task with requirements",
     "budget": 200,
     "category": "design",
     "checklist": [
       "Design mockup",
       "Create prototype",
       "Get feedback"
     ]
   }
   ```
3. GET `/tasks/:id` to retrieve task
4. Verify checklist items

**Expected Result**:
- ✅ Task created successfully
- ✅ 3 checklist items in database
- ✅ All items have `isChecked: false`
- ✅ GET response includes checklist array

**Pass/Fail**: [ ]

---

### TS1.3 - Task Creation Validation

**Objective**: Verify validation rules

**Test Cases**:

| Field | Value | Expected | Pass |
|-------|-------|----------|------|
| title | "" | 400 Error | [ ] |
| title | "a" | 400 Error (min 3 chars) | [ ] |
| budget | -10 | 400 Error | [ ] |
| budget | 0 | 400 Error | [ ] |
| category | "invalid" | 400 Error | [ ] |
| description | null | 400 Error | [ ] |

**Pass/Fail**: [ ]

---

## Test Scenario 2: Application Flow

### TS2.1 - Submit Application

**Objective**: Freelancer applies to open task

**Steps**:
1. Create task as employer (from TS1.1)
2. Login as freelancer
3. POST `/applications`:
   ```json
   {
     "taskId": "<task_id_from_step_1>",
     "coverLetter": "I'm interested in this task"
   }
   ```
4. Check response
5. Verify notification sent to employer

**Expected Result**:
- ✅ Status: 201 Created
- ✅ Application status is 'pending'
- ✅ Employer receives notification (#2: application_received)
- ✅ Task status remains 'open'

**Pass/Fail**: [ ]

---

### TS2.2 - Duplicate Application Prevention

**Objective**: Prevent multiple applications from same user

**Steps**:
1. Use task from TS2.1 (already applied)
2. Try to apply again with same freelancer

**Expected Result**:
- ✅ Status: 400 Bad Request
- ✅ Error message: "You have already applied to this task"
- ✅ No duplicate record in database

**Pass/Fail**: [ ]

---

### TS2.3 - Application to Closed Task

**Objective**: Verify cannot apply to closed tasks

**Steps**:
1. Create task as employer
2. Update task status to 'closed' directly in database
3. Try to apply as freelancer

**Expected Result**:
- ✅ Status: 400 Bad Request
- ✅ Error message: "Cannot apply to closed task"
- ✅ No application created

**Pass/Fail**: [ ]

---

## Test Scenario 3: Employer Actions

### TS3.1 - Accept Application

**Objective**: Employer accepts freelancer application

**Steps**:
1. Create task with application (from TS2.1)
2. Login as employer
3. PUT `/applications/:id`:
   ```json
   {
     "status": "accepted"
   }
   ```
4. Check notifications

**Expected Result**:
- ✅ Application status changed to 'accepted'
- ✅ Task status changed to 'in_progress'
- ✅ Freelancer receives notification (#3: application_accepted)
- ✅ Other pending applications (if any) unchanged

**Pass/Fail**: [ ]

---

### TS3.2 - Reject Application

**Objective**: Employer rejects application

**Steps**:
1. Create task with pending application
2. Login as employer
3. PUT `/applications/:id`:
   ```json
   {
     "status": "rejected"
   }
   ```
4. Verify notification

**Expected Result**:
- ✅ Application status changed to 'rejected'
- ✅ Task status remains 'open'
- ✅ Freelancer receives notification (#9: application_rejected)
- ✅ Freelancer can apply to other tasks

**Pass/Fail**: [ ]

---

### TS3.3 - Request Revision

**Objective**: Employer requests changes to submitted work

**Steps**:
1. Create task → Accept application
2. Wait for freelancer to submit (or manually set status to 'submitted')
3. Login as employer
4. PUT `/applications/:id`:
   ```json
   {
     "status": "needs_revision",
     "revisionNote": "Please update the design colors"
   }
   ```

**Expected Result**:
- ✅ Application status changed to 'needs_revision'
- ✅ Revision note saved
- ✅ Freelancer receives notification (#5: task_needs_revision)
- ✅ Task status remains 'in_progress'

**Pass/Fail**: [ ]

---

### TS3.4 - Approve and Rate (Immediate)

**Objective**: Employer approves work and rates immediately

**Steps**:
1. Create task → Accept → Submit
2. Login as employer
3. PUT `/applications/:id`:
   ```json
   {
     "status": "completed",
     "rating": 5,
     "ratingNote": "Excellent work!"
   }
   ```

**Expected Result**:
- ✅ Application status changed to 'completed'
- ✅ Task status changed to 'closed'
- ✅ Rating saved (5 stars)
- ✅ Freelancer receives notification (#8: task_rated)
- ✅ NO rating reminder sent (because rated immediately)

**Pass/Fail**: [ ]

---

### TS3.5 - Approve without Rating (Deferred)

**Objective**: Employer approves but rates later

**Steps**:
1. Create task → Accept → Submit
2. Login as employer
3. PUT `/applications/:id`:
   ```json
   {
     "status": "completed"
   }
   ```
4. Wait 1 second
5. POST `/applications/:id/rate`:
   ```json
   {
     "rating": 4,
     "ratingNote": "Good job"
   }
   ```

**Expected Result (Step 3)**:
- ✅ Application status changed to 'completed'
- ✅ Task status changed to 'closed'
- ✅ Freelancer receives notification (#6: task_approved)
- ✅ Employer receives notification (#7: rating_reminder)

**Expected Result (Step 5)**:
- ✅ Rating updated to 4
- ✅ Freelancer receives notification (#8: task_rated)

**Pass/Fail**: [ ]

---

## Test Scenario 4: Freelancer Actions

### TS4.1 - Resubmit After Revision (Auto-Approve)

**Objective**: Verify auto-approve logic for resubmissions

**Steps**:
1. Create task → Accept → Request revision (from TS3.3)
2. Login as freelancer
3. POST `/applications` with same taskId:
   ```json
   {
     "taskId": "<task_id>",
     "coverLetter": "Revised as requested"
   }
   ```

**Expected Result**:
- ✅ New application created
- ✅ Status immediately set to 'accepted' (auto-approve)
- ✅ Task status remains 'in_progress'
- ✅ Employer receives notification (#4: task_submitted)
- ✅ Previous application can still be accessed

**Pass/Fail**: [ ]

---

### TS4.2 - Check Notifications

**Objective**: Freelancer views received notifications

**Steps**:
1. Complete any flow that sends notifications to freelancer
2. Login as freelancer
3. GET `/notifications`
4. GET `/notifications/unread`

**Expected Result**:
- ✅ All notifications returned
- ✅ Unread notifications filtered correctly
- ✅ Notification types match actions taken
- ✅ Sorted by newest first

**Pass/Fail**: [ ]

---

### TS4.3 - Mark Notification as Read

**Objective**: Update notification read status

**Steps**:
1. Get unread notification ID (from TS4.2)
2. PUT `/notifications/:id/read`
3. GET `/notifications/unread` again

**Expected Result**:
- ✅ Notification marked as read
- ✅ `readAt` timestamp set
- ✅ Not in unread list anymore
- ✅ Still in full notifications list

**Pass/Fail**: [ ]

---

## Test Scenario 5: Task Management

### TS5.1 - Update Task Details

**Objective**: Employer edits task information

**Steps**:
1. Create task as employer
2. PUT `/tasks/:id`:
   ```json
   {
     "title": "Updated Title",
     "description": "Updated description",
     "budget": 150
   }
   ```

**Expected Result**:
- ✅ Task details updated
- ✅ Status unchanged
- ✅ Updated fields reflected
- ✅ Other fields unchanged

**Pass/Fail**: [ ]

---

### TS5.2 - Delete Task (No Applications)

**Objective**: Delete task without applications

**Steps**:
1. Create task as employer (no applications)
2. DELETE `/tasks/:id`
3. Try to GET `/tasks/:id`

**Expected Result**:
- ✅ Task permanently deleted
- ✅ 404 on subsequent GET
- ✅ No record in database

**Pass/Fail**: [ ]

---

### TS5.3 - Cancel Task (Has Applications)

**Objective**: Cancel task with pending applications

**Steps**:
1. Create task with applications
2. DELETE `/tasks/:id`
3. GET `/tasks/:id`

**Expected Result**:
- ✅ Task status set to 'cancelled'
- ✅ NOT deleted from database
- ✅ GET still returns task
- ✅ Applications remain accessible

**Pass/Fail**: [ ]

---

## Test Scenario 6: Edge Cases

### TS6.1 - Concurrent Application Acceptance

**Objective**: Test race condition handling

**Steps**:
1. Create task
2. Have 2 freelancers apply
3. Employer tries to accept both simultaneously

**Expected Result**:
- ✅ Only one application accepted
- ✅ Other application remains pending or gets error
- ✅ No database inconsistency

**Pass/Fail**: [ ]

---

### TS6.2 - Update Non-Existent Resource

**Objective**: Verify 404 handling

**Test Cases**:
| Endpoint | ID | Expected | Pass |
|----------|-----|----------|------|
| PUT /tasks/99999 | Invalid | 404 | [ ] |
| PUT /applications/99999 | Invalid | 404 | [ ] |
| DELETE /notifications/99999 | Invalid | 404 | [ ] |

**Pass/Fail**: [ ]

---

### TS6.3 - Unauthorized Access

**Objective**: Verify authorization checks

**Test Cases**:
| Action | User | Expected | Pass |
|--------|------|----------|------|
| Update employer's task | Freelancer | 403 | [ ] |
| Accept application | Different employer | 403 | [ ] |
| Rate task | Not employer | 403 | [ ] |

**Pass/Fail**: [ ]

---

## Test Scenario 7: Notification System

### TS7.1 - All 9 Notification Types

**Objective**: Verify all notifications trigger correctly

| # | Type | Trigger Action | Recipient | Pass |
|---|------|----------------|-----------|------|
| 1 | task_created | Create task | Public/All | [ ] |
| 2 | application_received | Apply to task | Employer | [ ] |
| 3 | application_accepted | Accept application | Freelancer | [ ] |
| 4 | task_submitted | Resubmit after revision | Employer | [ ] |
| 5 | task_needs_revision | Request revision | Freelancer | [ ] |
| 6 | task_approved | Approve without rating | Freelancer | [ ] |
| 7 | rating_reminder | Approve without rating | Employer | [ ] |
| 8 | task_rated | Rate task | Freelancer | [ ] |
| 9 | application_rejected | Reject application | Freelancer | [ ] |

**Pass/Fail**: [ ]

---

### TS7.2 - Notification Filtering

**Objective**: Test notification queries

**Steps**:
1. Create multiple notifications for user
2. Mark some as read
3. Test filters:
   - GET `/notifications` (all)
   - GET `/notifications/unread`
   - GET `/notifications?type=task_rated`

**Expected Result**:
- ✅ Filters work correctly
- ✅ Read/unread status accurate
- ✅ Type filtering works

**Pass/Fail**: [ ]

---

### TS7.3 - Bulk Mark as Read

**Objective**: Mark all notifications read at once

**Steps**:
1. Have multiple unread notifications
2. PUT `/notifications/read-all`
3. GET `/notifications/unread`

**Expected Result**:
- ✅ All notifications marked as read
- ✅ Unread count is 0
- ✅ `readAt` timestamps set

**Pass/Fail**: [ ]

---

## Test Scenario 8: Data Integrity

### TS8.1 - Foreign Key Constraints

**Objective**: Verify referential integrity

**Test Cases**:
| Action | Expected | Pass |
|--------|----------|------|
| Apply to non-existent task | Error | [ ] |
| Create task with invalid employer | Error | [ ] |
| Delete user with tasks | Cascade or prevent | [ ] |

**Pass/Fail**: [ ]

---

### TS8.2 - Enum Validation

**Objective**: Test enum field validation

**Test Cases**:
| Field | Invalid Value | Expected | Pass |
|-------|---------------|----------|------|
| task.status | "invalid" | 400 Error | [ ] |
| application.status | "xyz" | 400 Error | [ ] |
| notification.type | "test" | 400 Error | [ ] |

**Pass/Fail**: [ ]

---

## 📊 Test Summary

### Overall Results

- **Total Scenarios**: 8
- **Total Test Cases**: ~40
- **Passed**: ___
- **Failed**: ___
- **Blocked**: ___
- **Pass Rate**: ___%

### Critical Issues Found

1. 
2. 
3. 

### Recommendations

- 
- 
- 

---

**Tester**: _______________
**Date**: _______________
**Environment**: _______________
**Version**: _______________
