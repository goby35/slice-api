# 🧪 Postman Testing Guide - Slice API

Complete guide to test the Slice API using Postman. This guide covers all 9 notification types, task lifecycle, application flow, and authentication.

---

## 🆕 IMPORTANT UPDATE - New Submit Endpoint

**NEW ENDPOINT:** `POST /applications/:id/submit` - Freelancer submits work outcome

**Flow Changes:**
- 1st submission → Application & Task status = `in_review`
- 2nd submission (after needs_revision) → AUTO `completed` ⭐

**New Files:**
- 📖 `QUICK_START_VN.md` - Quick start guide in Vietnamese (5 min)
- 📚 `TESTING_GUIDE_VN.md` - Full testing guide in Vietnamese
- 🧪 `Slice_API_Submit_Tests.postman_collection.json` - Tests for submit endpoint

---

## 📋 Quick Start

### 1. Import Files into Postman

1. **Open Postman** (download from [postman.com](https://www.postman.com/downloads/))
2. **Import Collection**:
   - Click **Import** button (top left)
   - Select `tests/postman/Slice_API_Collection.postman_collection.json`
   - Collection "Slice API - Complete Flow Test" will appear in left sidebar
3. **Import Environment**:
   - Click **Environments** tab (left sidebar)
   - Click **Import**
   - Select `tests/postman/Slice_API_Local.postman_environment.json`
   - Environment "Slice API - Local" will be added

### 2. Configure Environment Variables

Click on "Slice API - Local" environment and set these values:

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `BASE_URL` | API server URL | `http://127.0.0.1:3000` |
| `LENS_API_URL` | Lens API for JWKS | `https://api.hey.xyz/graphql` |
| `EMPLOYER_JWT` | JWT token for employer | `eyJhbGciOiJIUzI1Ni...` |
| `FREELANCER_JWT` | JWT token for freelancer | `eyJhbGciOiJIUzI1Ni...` |

**Auto-filled by tests** (leave empty initially):
- `EMPLOYER_PROFILE` - Employer's profileId
- `FREELANCER_PROFILE` - Freelancer's profileId
- `TASK_ID` - Created task ID
- `APP_ID` - Created application ID
- `NOTIF_ID` - Notification ID for testing

---

## 🔐 Authentication Setup

### Option A: Using Real JWT Tokens

If you have access to Lens/Hey ecosystem:

1. Get valid JWT tokens from your authentication flow
2. Paste into `EMPLOYER_JWT` and `FREELANCER_JWT` variables
3. Ensure `LENS_API_URL` is set correctly

### Option B: Bypass Auth for Local Testing (Development Only)

**⚠️ Only for local testing - DO NOT use in production**

Temporarily modify `src/middlewares/authMiddleware.ts`:

```typescript
// Quick bypass for local testing
export default async function authMiddleware(c: Context, next: Function) {
  // Mock user for testing
  c.set('user', {
    sub: 'employer_test_local',
    act: { sub: 'employer_test_local' }
  });
  await next();
}
```

Or create a test script:
```bash
# scripts/disable-auth-for-testing.js
// Backup and modify authMiddleware temporarily
```

### Option C: Generate Test JWT

Use the decode script to understand token structure:
```bash
node scripts/decode-jwt.mjs YOUR_TOKEN_HERE
```

---

## 📂 Collection Structure

The collection is organized into 8 folders:

### 0. Setup & Sanity Check
- ✅ Verify server is running

### 1. Users Management
- Create employer user
- Create freelancer user
- List users
- Get user details

### 2. Tasks (Employer)
- ✅ **POST /tasks** - Create task with checklist [Notification #1]
- GET /tasks - List all tasks
- GET /tasks/:id - Get task details with checklist
- PUT /tasks/:id - Update task

### 3. Applications (Freelancer)
- ✅ **POST /applications** - Apply for task [Notification #2]
- GET /applications - List all applications
- GET /applications/task/:taskId - Get applications for specific task

### 4. Employer Actions
- ✅ **PUT needs_revision** - Request changes [Notification #5]
- ✅ **PUT accepted** - Accept application [Notification #3]
- ✅ **PUT rejected** - Reject application [Notification #9]
- ✅ **PUT completed + rate** - Approve & rate [Notifications #6, #8]
- ✅ **POST /rate** - Rate after auto-approve [Notification #8]

### 5. Freelancer Resubmit
- ✅ **POST /applications** - Resubmit (auto-approve) [Notifications #4, #7]

### 6. Notifications
- GET /notifications - Check notifications (Freelancer)
- GET /notifications - Check notifications (Employer)
- GET /notifications/unread - Count unread
- PUT /notifications/:id/read - Mark as read
- PUT /notifications/read-all - Mark all as read
- DELETE /notifications/:id - Delete notification

### 7. Task Management
- DELETE /tasks/:id - Cancel or delete task

### 8. Proxy Endpoints
- GET /metadata/sts - Proxy to Hey API
- GET /oembed/get - Proxy OEmbed request

---

## 🎯 Testing Flow (Happy Path)

Follow this sequence to test the complete flow:

### Phase 1: Setup (2 minutes)
1. ✅ GET / - Server check
2. ✅ POST /users (employer)
3. ✅ POST /users (freelancer)

### Phase 2: Task Creation (1 minute)
4. ✅ POST /tasks - Create task with checklist
   - **Notification #1**: task_created → Public
5. ✅ GET /tasks/:id - Verify task + checklist

### Phase 3: Application (1 minute)
6. ✅ POST /applications - Freelancer applies
   - **Notification #2**: application_received → Employer

### Phase 4: Employer Review (3 minutes)

**Scenario A: Request Revision**
7. ✅ PUT /applications/:id {status: "needs_revision"}
   - **Notification #5**: task_needs_revision → Freelancer
8. ✅ POST /applications - Freelancer resubmits
   - **Auto-approve triggered**
   - **Notification #4**: task_submitted → Employer
   - **Notification #7**: rating_reminder → Employer
9. ✅ POST /applications/:id/rate - Employer rates
   - **Notification #8**: task_rated → Freelancer

**Scenario B: Accept Immediately**
7. ✅ PUT /applications/:id {status: "accepted"}
   - **Notification #3**: application_accepted → Freelancer
8. ✅ PUT /applications/:id {status: "completed", rating: 5}
   - **Notification #6**: task_approved → Freelancer
   - **Notification #8**: task_rated → Freelancer

**Scenario C: Reject**
7. ✅ PUT /applications/:id {status: "rejected"}
   - **Notification #9**: application_rejected → Freelancer

### Phase 5: Notifications Check (2 minutes)
10. ✅ GET /notifications - Freelancer checks
11. ✅ GET /notifications/unread - Count unread
12. ✅ PUT /notifications/:id/read - Mark as read
13. ✅ PUT /notifications/read-all - Mark all as read

### Phase 6: Cleanup (1 minute)
14. ✅ DELETE /tasks/:id - Cancel/delete task

---

## 🏃 Running Tests with Collection Runner

### Step-by-Step:

1. **Open Collection Runner**
   - Click collection name → Click "Run" button
   - Or right-click collection → "Run collection"

2. **Select Environment**
   - Choose "Slice API - Local" from dropdown

3. **Configure Run**
   - **Iterations**: 1 (default)
   - **Delay**: 100ms between requests (recommended)
   - **Data**: None (we use environment variables)

4. **Select Requests**
   - Run all folders in order OR
   - Select specific folders for targeted testing

5. **Click "Run Slice API - Complete Flow Test"**

6. **Watch Results**
   - Green = Passed
   - Red = Failed
   - View response bodies, test results, and console logs

### Tips:
- ✅ Run **"0. Setup & Sanity Check"** first
- ✅ Run **"1. Users Management"** to create test users
- ✅ Run **"2. Tasks"** → **"3. Applications"** → **"4. Employer Actions"** in order
- ✅ Run **"6. Notifications"** after any action that sends notifications
- ⚠️ Some requests depend on previous requests (e.g., TASK_ID, APP_ID)

---

## 🧪 Test Assertions Included

Each request has automatic test assertions:

### Status Code Checks
```javascript
pm.test("Status 200", () => {
    pm.response.to.have.status(200);
});
```

### Response Shape Validation
```javascript
pm.test("Has task ID", () => {
    pm.expect(json.id).to.be.a('number');
});
```

### Variable Extraction
```javascript
// Automatically saves IDs for next requests
pm.environment.set("TASK_ID", json.id);
pm.environment.set("APP_ID", json.id);
```

### Notification Type Validation
```javascript
pm.test("Has valid notification types", () => {
    const validTypes = [
        'task_created', 'application_received', 'application_accepted',
        'application_rejected', 'task_submitted', 'task_needs_revision',
        'task_approved', 'rating_reminder', 'task_rated'
    ];
    pm.expect(validTypes).to.include(json.type);
});
```

---

## 🔍 Troubleshooting

### ❌ Error: 401 Unauthorized

**Problem**: JWT token is invalid or missing

**Solutions**:
1. Check `EMPLOYER_JWT` and `FREELANCER_JWT` are set
2. Verify tokens are not expired
3. Ensure `LENS_API_URL` is correct
4. Use Option B (bypass auth) for local testing

### ❌ Error: ECONNREFUSED

**Problem**: Server is not running

**Solutions**:
1. Start the server:
   ```bash
   npm run build
   node ./dist/src/index.js
   ```
   Or:
   ```bash
   npx vercel dev
   ```
2. Verify `BASE_URL` matches server port

### ❌ Error: 404 Not Found

**Problem**: Endpoint does not exist or wrong URL

**Solutions**:
1. Check `BASE_URL` has no trailing slash
2. Verify migration was run
3. Check server logs for routing issues

### ❌ Error: Variable TASK_ID not set

**Problem**: Requests run out of order

**Solutions**:
1. Run requests in sequence (use Collection Runner)
2. Manually run "POST /tasks" first to set TASK_ID
3. Check test scripts are saving variables correctly

### ❌ Error: Database connection failed

**Problem**: PostgreSQL not running or misconfigured

**Solutions**:
1. Start PostgreSQL:
   ```bash
   # Windows
   pg_ctl start
   
   # Mac
   brew services start postgresql
   
   # Linux
   sudo systemctl start postgresql
   ```
2. Run migration:
   ```bash
   psql -U postgres -d slice_db -f migrations/001_add_notifications_and_checklists.sql
   ```
3. Check `src/db/index.ts` connection string

### ❌ Tests fail: "Task not found"

**Problem**: Test data was cleaned up or doesn't exist

**Solutions**:
1. Re-run user creation requests
2. Re-run task creation requests
3. Check database has data:
   ```sql
   SELECT * FROM tasks;
   SELECT * FROM task_applications;
   ```

---

## 📊 Expected Test Results

When running the full collection (happy path), you should see:

### ✅ All Notifications Triggered:
1. ✅ task_created → When employer creates task
2. ✅ application_received → When freelancer applies
3. ✅ application_accepted → When employer accepts
4. ✅ task_submitted → When freelancer resubmits
5. ✅ task_needs_revision → When employer requests changes
6. ✅ task_approved → When employer approves completion
7. ✅ rating_reminder → After auto-approve
8. ✅ task_rated → When employer rates
9. ✅ application_rejected → When employer rejects

### ✅ Success Metrics:
- **Total Requests**: 30+
- **Passed Tests**: 60+ assertions
- **Failed Tests**: 0
- **Duration**: ~5-10 seconds (with delays)

---

## 🎨 Custom Test Scenarios

### Scenario 1: Multiple Applications
```javascript
// Test multiple freelancers applying to same task
// 1. Create task (Employer)
// 2. POST /applications (Freelancer A)
// 3. POST /applications (Freelancer B)
// 4. GET /applications/task/:taskId → Should see 2 applications
// 5. PUT accept one, PUT reject the other
```

### Scenario 2: Revision Loop
```javascript
// Test multiple revision rounds
// 1. POST /applications (submit)
// 2. PUT needs_revision (request changes)
// 3. POST /applications (resubmit) → auto-approve
// 4. Verify notifications sent correctly
```

### Scenario 3: Task Cancellation
```javascript
// Test cancellation with/without applications
// 1. Create task
// 2. No applications → DELETE should permanently delete
// 3. Create task
// 4. Add application → DELETE should only cancel (status='cancelled')
```

---

## 📝 Manual Testing Checklist

Use this checklist for comprehensive testing:

### Pre-Test Setup
- [ ] Server is running (`GET /` returns 200)
- [ ] Database migration completed
- [ ] Environment variables configured
- [ ] JWT tokens are valid (if using auth)

### Core Features
- [ ] Create users (employer + freelancer)
- [ ] Create task with checklist
- [ ] View task details including checklist
- [ ] Apply for task
- [ ] List applications for task
- [ ] Employer accepts application
- [ ] Employer rejects application
- [ ] Employer requests revision
- [ ] Freelancer resubmits (auto-approve)
- [ ] Employer rates work
- [ ] View notifications
- [ ] Mark notifications as read
- [ ] Delete task (with/without applications)

### Edge Cases
- [ ] Apply twice to same task (should fail or handle correctly)
- [ ] Update non-existent task (404)
- [ ] Delete non-existent application (404)
- [ ] Access other user's data (403)
- [ ] Invalid JWT (401)
- [ ] Missing required fields (400)

### Notifications
- [ ] Verify all 9 notification types are created
- [ ] Check notification recipients are correct
- [ ] Test unread count accuracy
- [ ] Test mark as read functionality
- [ ] Test delete notification

---

## 🚀 Next Steps

### For CI/CD Integration:
```bash
# Run collection via Newman (Postman CLI)
npm install -g newman

newman run tests/postman/Slice_API_Collection.postman_collection.json \
  --environment tests/postman/Slice_API_Local.postman_environment.json \
  --reporters cli,json \
  --reporter-json-export results.json
```

### For Performance Testing:
```bash
# Run with multiple iterations
newman run tests/postman/Slice_API_Collection.postman_collection.json \
  --environment tests/postman/Slice_API_Local.postman_environment.json \
  --iteration-count 10 \
  --delay-request 200
```

### For Automated Testing:
Add to `package.json`:
```json
{
  "scripts": {
    "test:api": "newman run tests/postman/Slice_API_Collection.postman_collection.json -e tests/postman/Slice_API_Local.postman_environment.json",
    "test:api:watch": "nodemon --exec npm run test:api"
  }
}
```

---

## 📚 Additional Resources

- **Postman Documentation**: https://learning.postman.com/
- **Newman CLI**: https://www.npmjs.com/package/newman
- **API Flow Documentation**: `docs/API_FLOW.md`
- **Database Schema**: `src/db/schema.ts`
- **Migration SQL**: `migrations/001_add_notifications_and_checklists.sql`

---

## ✅ Quick Command Reference

```bash
# Start server
npm run build && node ./dist/src/index.js

# Or with Vercel
npx vercel dev

# Run migration
psql -U postgres -d slice_db -f migrations/001_add_notifications_and_checklists.sql

# Check JWKS
node scripts/check-jwks.mjs

# Decode JWT
node scripts/decode-jwt.mjs YOUR_TOKEN

# Run Postman collection via CLI
newman run tests/postman/Slice_API_Collection.postman_collection.json \
  -e tests/postman/Slice_API_Local.postman_environment.json
```

---

**Happy Testing! 🎉**

If you encounter any issues, check the troubleshooting section or refer to the main API documentation.
