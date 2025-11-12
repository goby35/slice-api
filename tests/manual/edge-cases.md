# 🔍 Edge Cases Testing

Comprehensive edge case testing for Slice API to ensure robustness and reliability.

---

## 1. 🚫 Boundary Conditions

### EC1.1 - String Length Limits

| Field | Min | Max | Test Value | Expected | Result |
|-------|-----|-----|------------|----------|--------|
| task.title | 3 | 200 | "ab" | 400 Error | [ ] |
| task.title | 3 | 200 | "abc" | Success | [ ] |
| task.title | 3 | 200 | "a" × 201 | 400 Error | [ ] |
| task.description | 1 | 5000 | "" | 400 Error | [ ] |
| task.description | 1 | 5000 | "a" × 5001 | 400 Error | [ ] |
| coverLetter | 1 | 2000 | "a" × 2001 | 400 Error | [ ] |

### EC1.2 - Numeric Boundaries

| Field | Min | Max | Test Value | Expected | Result |
|-------|-----|-----|------------|----------|--------|
| budget | 1 | ∞ | 0 | Error | [ ] |
| budget | 1 | ∞ | -1 | Error | [ ] |
| budget | 1 | ∞ | 1 | Success | [ ] |
| budget | 1 | ∞ | 999999999 | Success | [ ] |
| rating | 1 | 5 | 0 | Error | [ ] |
| rating | 1 | 5 | 6 | Error | [ ] |
| rating | 1 | 5 | 3.5 | Error (not int) | [ ] |

### EC1.3 - Array Limits

| Field | Min | Max | Test Value | Expected | Result |
|-------|-----|-----|------------|----------|--------|
| checklist | 0 | 20 | [] | Success | [ ] |
| checklist | 0 | 20 | 21 items | Error | [ ] |
| checklist | 0 | 20 | null | Success (optional) | [ ] |

---

## 2. 🔤 Input Validation

### EC2.1 - Special Characters

**Test**: Create task with special characters in title

```json
{
  "title": "Task <script>alert('XSS')</script>",
  "description": "Test'; DROP TABLE tasks;--",
  "budget": 100,
  "category": "development"
}
```

**Expected**:
- ✅ HTML tags escaped/sanitized
- ✅ SQL injection prevented
- ✅ XSS attack blocked
- ✅ Data saved safely

**Result**: [ ]

### EC2.2 - Unicode Characters

```json
{
  "title": "任务 🚀 émoji tëst",
  "description": "مرحبا 你好 Привет",
  "budget": 100,
  "category": "development"
}
```

**Expected**:
- ✅ Unicode saved correctly
- ✅ Emojis handled
- ✅ RTL text supported
- ✅ Retrieved without corruption

**Result**: [ ]

### EC2.3 - Whitespace Handling

| Input | Expected | Result |
|-------|----------|--------|
| "  title  " | Trimmed to "title" | [ ] |
| "\n\ttitle\n" | Trimmed | [ ] |
| "title   name" | Preserved internal spaces | [ ] |
| "   " | Error (empty after trim) | [ ] |

---

## 3. ⏱️ Timing Issues

### EC3.1 - Concurrent Requests

**Scenario**: Two employers accept same freelancer's application simultaneously

**Setup**:
1. Create task
2. Freelancer applies
3. Send 2 PUT requests at same time with "accepted"

**Expected**:
- ✅ Database handles concurrency (locks)
- ✅ Only one succeeds
- ✅ Other gets appropriate error
- ✅ No data corruption

**Result**: [ ]

### EC3.2 - Request Timeout

**Test**: Simulate slow database query

**Expected**:
- ✅ Request times out gracefully
- ✅ Returns 504 Gateway Timeout
- ✅ No hanging connections
- ✅ Proper cleanup

**Result**: [ ]

### EC3.3 - Rapid Sequential Requests

**Test**: Submit 100 applications in 1 second

**Expected**:
- ✅ Rate limiter kicks in
- ✅ 429 Too Many Requests returned
- ✅ Valid requests still processed
- ✅ System remains stable

**Result**: [ ]

---

## 4. 🔐 Authentication Edge Cases

### EC4.1 - Missing Token

```
GET /notifications
Headers: (no Authorization header)
```

**Expected**:
- ✅ 401 Unauthorized
- ✅ Clear error message

**Result**: [ ]

### EC4.2 - Invalid Token Format

| Token Value | Expected | Result |
|-------------|----------|--------|
| "Bearer " | 401 | [ ] |
| "InvalidToken" | 401 | [ ] |
| "Bearer invalid.jwt.token" | 401 | [ ] |
| "Bearer" + " " × 1000 | 401 | [ ] |

### EC4.3 - Expired Token

**Test**: Use token with expired `exp` claim

**Expected**:
- ✅ 401 Unauthorized
- ✅ Message: "Token expired"

**Result**: [ ]

### EC4.4 - Token from Different User

**Scenario**: Try to update Task A using Token B

**Expected**:
- ✅ 403 Forbidden
- ✅ Message: "Not authorized"

**Result**: [ ]

---

## 5. 📊 Data State Issues

### EC5.1 - Invalid State Transitions

| Current Status | New Status | Expected | Result |
|----------------|------------|----------|--------|
| pending | completed | Error | [ ] |
| accepted | pending | Error | [ ] |
| rejected | accepted | Error | [ ] |
| completed | needs_revision | Error | [ ] |

### EC5.2 - Orphaned Records

**Scenario**: Delete task with applications

**Test**:
1. Create task with application
2. Force delete task (bypass logic)
3. Try to access application

**Expected**:
- ✅ Foreign key constraint prevents delete, OR
- ✅ Cascade delete removes applications, OR
- ✅ Application marked as orphaned

**Result**: [ ]

### EC5.3 - Duplicate Submissions

**Test**: Submit same form twice (double-click)

**Expected**:
- ✅ Idempotency check
- ✅ Second request returns existing record
- ✅ No duplicate created

**Result**: [ ]

---

## 6. 🗃️ Database Edge Cases

### EC6.1 - Large Dataset Queries

**Test**: Fetch tasks when 10,000+ tasks exist

```
GET /tasks?limit=1000
```

**Expected**:
- ✅ Response within 5 seconds
- ✅ Pagination works
- ✅ No memory issues
- ✅ Indexes used

**Result**: [ ]

### EC6.2 - NULL vs Empty String

| Field | Value | Stored As | Result |
|-------|-------|-----------|--------|
| revisionNote | null | NULL | [ ] |
| revisionNote | "" | Empty string | [ ] |
| revisionNote | undefined | NULL | [ ] |

**Expected**: Consistent handling across all fields

### EC6.3 - Database Connection Lost

**Test**: Disconnect database during request

**Expected**:
- ✅ 503 Service Unavailable
- ✅ Error logged
- ✅ Graceful degradation
- ✅ Auto-reconnect attempted

**Result**: [ ]

---

## 7. 🔗 Relationship Edge Cases

### EC7.1 - Task with Multiple Applications

**Scenario**: 10 freelancers apply to same task

**Test**:
1. Create task
2. 10 different users apply
3. Employer accepts one

**Expected**:
- ✅ All 10 applications created
- ✅ Only accepted app changes task status
- ✅ Other 9 apps remain pending
- ✅ Correct notifications sent

**Result**: [ ]

### EC7.2 - User with No Activity

**Test**: Query notifications for brand new user

```
GET /notifications
```

**Expected**:
- ✅ Empty array returned
- ✅ No error
- ✅ 200 OK status

**Result**: [ ]

### EC7.3 - Circular References

**Test**: User tries to apply to their own task

**Expected**:
- ✅ 400 Bad Request
- ✅ Error: "Cannot apply to own task"

**Result**: [ ]

---

## 8. 🌐 HTTP Edge Cases

### EC8.1 - Unsupported Methods

| Endpoint | Method | Expected | Result |
|----------|--------|----------|--------|
| /tasks | PATCH | 405 | [ ] |
| /applications | HEAD | 405 or 200 | [ ] |
| /notifications | OPTIONS | 200 (CORS) | [ ] |

### EC8.2 - Wrong Content-Type

```
POST /tasks
Content-Type: text/plain
Body: "not json"
```

**Expected**:
- ✅ 400 Bad Request
- ✅ Error: "Invalid JSON"

**Result**: [ ]

### EC8.3 - Large Request Body

**Test**: POST task with 10MB description

**Expected**:
- ✅ 413 Payload Too Large
- ✅ Request rejected at middleware
- ✅ No processing attempted

**Result**: [ ]

---

## 9. 🎭 Business Logic Edge Cases

### EC9.1 - Rating After Task Deleted

**Scenario**:
1. Complete task
2. Delete task
3. Try to rate

**Expected**:
- ✅ 404 Task Not Found, OR
- ✅ Rating still allowed (task soft-deleted)

**Result**: [ ]

### EC9.2 - Multiple Revisions

**Test**: Request revision 5 times in a row

**Expected**:
- ✅ All revisions tracked
- ✅ No limit enforced (or limit specified)
- ✅ Freelancer can resubmit each time

**Result**: [ ]

### EC9.3 - Task Budget vs Payment

**Scenario**: Task budget is $100, but payment field exists

**Test**: Can payment differ from budget?

**Expected**:
- ✅ Clear business rule documented
- ✅ Validation enforced if needed

**Result**: [ ]

---

## 10. 🔄 Idempotency

### EC10.1 - Duplicate POST Requests

**Test**: Send same POST /applications twice

**Expected**:
- ✅ First request: 201 Created
- ✅ Second request: 409 Conflict or return existing
- ✅ Only one record created

**Result**: [ ]

### EC10.2 - Duplicate PUT Requests

**Test**: Send same PUT /tasks/:id twice

**Expected**:
- ✅ Both succeed with 200
- ✅ Same result (idempotent)
- ✅ Updated timestamp may differ

**Result**: [ ]

### EC10.3 - Duplicate DELETE Requests

**Test**: DELETE same task twice

**Expected**:
- ✅ First request: 200 or 204
- ✅ Second request: 404 Not Found
- ✅ No error on second attempt (idempotent)

**Result**: [ ]

---

## 11. 🚨 Error Recovery

### EC11.1 - Partial Update Failure

**Scenario**: Update task with checklist, checklist insert fails

**Expected**:
- ✅ Transaction rolled back
- ✅ Task not updated
- ✅ Error returned
- ✅ Database consistent

**Result**: [ ]

### EC11.2 - Notification Sending Failure

**Scenario**: Application accepted, but notification service fails

**Expected**:
- ✅ Application still updated
- ✅ Error logged
- ✅ Retry attempted (if configured)
- ✅ User notified via other channel

**Result**: [ ]

---

## 12. 🌍 Internationalization

### EC12.1 - Different Locales

**Test**: Send requests with different `Accept-Language` headers

| Header | Expected Response | Result |
|--------|-------------------|--------|
| en-US | English | [ ] |
| vi-VN | Vietnamese | [ ] |
| fr-FR | French | [ ] |
| (none) | Default (English) | [ ] |

### EC12.2 - Currency/Numbers

**Test**: Budget field with different formats

| Input | Expected | Result |
|-------|----------|--------|
| 100 | $100 | [ ] |
| 100.50 | $100.50 | [ ] |
| 1,000 | Error (invalid) | [ ] |
| "100" | Coerced to 100 | [ ] |

---

## 13. 📱 Mobile/Network Issues

### EC13.1 - Slow Network

**Test**: Simulate 2G network (50kbps)

**Expected**:
- ✅ Response still arrives
- ✅ May take longer but doesn't timeout
- ✅ No data loss

**Result**: [ ]

### EC13.2 - Connection Dropped Mid-Request

**Test**: Start request, disconnect before response

**Expected**:
- ✅ Server completes processing
- ✅ Client gets no response
- ✅ Retry safe (idempotent)

**Result**: [ ]

---

## 14. 🔒 Security Edge Cases

### EC14.1 - SQL Injection Attempts

```json
{
  "title": "Task'; DROP TABLE tasks;--",
  "description": "1' OR '1'='1"
}
```

**Expected**:
- ✅ Parameterized queries prevent injection
- ✅ Data saved as literal string
- ✅ No database commands executed

**Result**: [ ]

### EC14.2 - XSS Attempts

```json
{
  "title": "<img src=x onerror=alert('XSS')>"
}
```

**Expected**:
- ✅ HTML escaped on output
- ✅ Script not executed
- ✅ Stored safely

**Result**: [ ]

### EC14.3 - CSRF Attempts

**Test**: Submit form from different origin

**Expected**:
- ✅ CORS policy enforced
- ✅ Request blocked
- ✅ 403 Forbidden

**Result**: [ ]

---

## 15. 🎲 Random/Unexpected Input

### EC15.1 - Non-Existent Fields

```json
{
  "title": "Task",
  "budget": 100,
  "category": "development",
  "unexpectedField": "should be ignored"
}
```

**Expected**:
- ✅ Extra fields ignored
- ✅ No error thrown
- ✅ Only valid fields saved

**Result**: [ ]

### EC15.2 - Nested Objects

```json
{
  "title": {
    "en": "Task",
    "vi": "Nhiệm vụ"
  }
}
```

**Expected** (if not supported):
- ✅ 400 Bad Request
- ✅ Error: "title must be string"

**Result**: [ ]

---

## 📊 Summary

### Edge Case Coverage

- **Total Cases**: ~80
- **Tested**: ___
- **Passed**: ___
- **Failed**: ___
- **Coverage**: ___%

### Critical Edge Cases Found

1. 
2. 
3. 

### Recommendations

- Add validation for: ___
- Improve error handling for: ___
- Consider edge case: ___

---

**Tester**: _______________
**Date**: _______________
