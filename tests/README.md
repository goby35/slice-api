# 🧪 Testing Documentation

Comprehensive testing guide for Slice API, including Postman tests, manual testing, and automated testing strategies.

---

## 📁 Testing Structure

```
tests/
├── postman/
│   ├── Slice_API_Collection.postman_collection.json    # Full API collection
│   ├── Slice_API_Local.postman_environment.json        # Local environment
│   └── README.md                                        # Postman guide
├── manual/
│   ├── test-scenarios.md                               # Manual test cases
│   └── edge-cases.md                                   # Edge case testing
└── scripts/
    ├── test-full-flow.sh                               # Automated flow test
    └── cleanup-test-data.sql                           # Cleanup script
```

---

## 🎯 Testing Levels

### 1. Unit Tests (Future)
- Individual function testing
- Database query testing
- Middleware testing

### 2. Integration Tests (Current)
- **Postman Collection** ✅
- API endpoint testing
- Flow testing (create → apply → approve → rate)
- Notification system testing

### 3. End-to-End Tests (Future)
- Full user journey testing
- Frontend + Backend integration
- Database persistence verification

---

## 🚀 Quick Start

### Option 1: Postman GUI (Recommended)

1. **Import Collection**:
   ```
   File → Import → tests/postman/Slice_API_Collection.postman_collection.json
   ```

2. **Import Environment**:
   ```
   Environments → Import → tests/postman/Slice_API_Local.postman_environment.json
   ```

3. **Configure**:
   - Set `BASE_URL` to your server
   - Set `EMPLOYER_JWT` and `FREELANCER_JWT`
   - (Or bypass auth for local testing)

4. **Run**:
   - Click collection → Run
   - Select environment
   - Click "Run Slice API..."

### Option 2: Newman CLI (Automated)

```bash
# Install Newman
npm install -g newman

# Run collection
newman run tests/postman/Slice_API_Collection.postman_collection.json \
  --environment tests/postman/Slice_API_Local.postman_environment.json \
  --reporters cli,json,html \
  --reporter-html-export test-results.html
```

### Option 3: npm Scripts (Integrated)

Add to `package.json`:
```json
{
  "scripts": {
    "test:api": "newman run tests/postman/Slice_API_Collection.postman_collection.json -e tests/postman/Slice_API_Local.postman_environment.json",
    "test:api:verbose": "npm run test:api -- --verbose",
    "test:api:report": "npm run test:api -- --reporters cli,html --reporter-html-export test-results.html"
  }
}
```

Then run:
```bash
npm run test:api
```

---

## 📋 Test Coverage

### API Endpoints Coverage: 32/32 (100%)

#### ✅ Tasks API (5 endpoints)
- [x] GET /tasks
- [x] POST /tasks (auth required)
- [x] GET /tasks/:id
- [x] PUT /tasks/:id
- [x] DELETE /tasks/:id (auth required)

#### ✅ Applications API (6 endpoints)
- [x] GET /applications
- [x] POST /applications (auth required)
- [x] GET /applications/task/:taskId
- [x] PUT /applications/:id (auth required)
- [x] POST /applications/:id/rate (auth required)
- [x] DELETE /applications/:id (auth required)

#### ✅ Notifications API (6 endpoints)
- [x] GET /notifications (auth required)
- [x] GET /notifications/unread (auth required)
- [x] PUT /notifications/:id/read (auth required)
- [x] PUT /notifications/read-all (auth required)
- [x] DELETE /notifications/:id (auth required)

#### ✅ Users API (5 endpoints)
- [x] GET /users
- [x] POST /users
- [x] GET /users/:profileId
- [x] PUT /users/:profileId
- [x] DELETE /users/:profileId
- [x] POST /users/:profileId/adjust-points

#### ✅ Proxy Endpoints (3 endpoints)
- [x] GET /
- [x] GET /metadata/sts
- [x] GET /oembed/get

### Notification Coverage: 9/9 (100%)

- [x] #1 task_created → Public
- [x] #2 application_received → Employer
- [x] #3 application_accepted → Freelancer
- [x] #4 task_submitted → Employer
- [x] #5 task_needs_revision → Freelancer
- [x] #6 task_approved → Freelancer
- [x] #7 rating_reminder → Employer
- [x] #8 task_rated → Freelancer
- [x] #9 application_rejected → Freelancer

### Flow Coverage

- [x] Task creation with checklist
- [x] Application submission
- [x] Employer accept flow
- [x] Employer reject flow (with notification #9)
- [x] Employer request revision flow
- [x] Freelancer resubmit (auto-approve)
- [x] Rating system (immediate + deferred)
- [x] Task cancellation (with/without applications)
- [x] Notification management (read/unread/delete)

---

## 🎭 Test Scenarios

### Scenario 1: Happy Path (All Pass)
```
1. Create employer & freelancer users
2. Employer creates task with checklist
3. Freelancer applies
4. Employer accepts
5. Employer approves & rates
6. Freelancer checks notifications
7. Task completed successfully
```

**Expected**: All notifications sent, all assertions pass

### Scenario 2: Revision Loop
```
1. Freelancer applies
2. Employer requests revision
3. Freelancer resubmits → Auto-approve
4. Employer rates (separate step)
```

**Expected**: 
- Notification #5 sent (needs_revision)
- Notification #4 sent (task_submitted)
- Notification #7 sent (rating_reminder)
- Notification #8 sent (task_rated)

### Scenario 3: Rejection Flow
```
1. Freelancer applies
2. Employer rejects application
3. Freelancer receives notification
```

**Expected**:
- Application status = 'rejected'
- Notification #9 sent to freelancer
- Freelancer can apply to other tasks

### Scenario 4: Multiple Applications
```
1. Employer creates task
2. Freelancer A applies
3. Freelancer B applies
4. Employer accepts A, rejects B
```

**Expected**:
- 2 applications created
- A receives notification #3 (accepted)
- B receives notification #9 (rejected)

### Scenario 5: Task Cancellation
```
Case A: No applications
1. Create task
2. DELETE task → Permanently deleted

Case B: Has applications
1. Create task
2. Freelancer applies
3. DELETE task → Status set to 'cancelled' (not deleted)
```

---

## 🔧 Environment Setup

### Development Environment
```json
{
  "BASE_URL": "http://127.0.0.1:3000",
  "LENS_API_URL": "https://api.hey.xyz/graphql",
  "EMPLOYER_JWT": "test_token_employer",
  "FREELANCER_JWT": "test_token_freelancer"
}
```

### Staging Environment
```json
{
  "BASE_URL": "https://staging-api.yourapp.com",
  "LENS_API_URL": "https://api.hey.xyz/graphql",
  "EMPLOYER_JWT": "{{EMPLOYER_TOKEN}}",
  "FREELANCER_JWT": "{{FREELANCER_TOKEN}}"
}
```

### Production Environment
```json
{
  "BASE_URL": "https://api.yourapp.com",
  "LENS_API_URL": "https://api.hey.xyz/graphql",
  "EMPLOYER_JWT": "{{PROD_EMPLOYER_TOKEN}}",
  "FREELANCER_JWT": "{{PROD_FREELANCER_TOKEN}}"
}
```

---

## 📊 Test Reports

### Newman HTML Report

After running with `--reporter-html-export`:
```
test-results.html       # Open in browser for visual report
```

### Newman JSON Report

For CI/CD integration:
```json
{
  "collection": "Slice API - Complete Flow Test",
  "run": {
    "stats": {
      "requests": { "total": 30, "failed": 0 },
      "tests": { "total": 65, "failed": 0 },
      "assertions": { "total": 65, "failed": 0 }
    }
  }
}
```

### Custom Reporting

Create custom reports with Newman:
```javascript
// custom-reporter.js
const newman = require('newman');

newman.run({
  collection: require('./tests/postman/Slice_API_Collection.postman_collection.json'),
  environment: require('./tests/postman/Slice_API_Local.postman_environment.json'),
  reporters: ['cli', 'json'],
  reporter: {
    json: {
      export: './test-results.json'
    }
  }
}, (err, summary) => {
  if (err) throw err;
  
  console.log('Collection run complete!');
  console.log(`Total requests: ${summary.run.stats.requests.total}`);
  console.log(`Failed requests: ${summary.run.stats.requests.failed}`);
  console.log(`Total tests: ${summary.run.stats.tests.total}`);
  console.log(`Failed tests: ${summary.run.stats.tests.failed}`);
});
```

---

## 🐛 Debugging Tests

### Enable Verbose Logging
```bash
newman run tests/postman/Slice_API_Collection.postman_collection.json \
  -e tests/postman/Slice_API_Local.postman_environment.json \
  --verbose \
  --color on
```

### View Request/Response
```bash
newman run ... --debug
```

### Console.log in Tests
```javascript
// In Postman test script
console.log('TASK_ID:', pm.environment.get('TASK_ID'));
console.log('Response:', pm.response.json());
```

### Postman Console
In Postman app:
- View → Show Postman Console (Alt+Ctrl+C)
- See all requests/responses/logs in real-time

---

## ✅ Pre-Test Checklist

Before running tests, ensure:

- [ ] PostgreSQL is running
- [ ] Database migration completed
- [ ] Server is running and accessible
- [ ] Environment variables configured
- [ ] JWT tokens are valid (or auth bypassed)
- [ ] No conflicting test data in database

Quick verification:
```bash
# Check server
curl http://127.0.0.1:3000/

# Check database
psql -U postgres -d slice_db -c "SELECT COUNT(*) FROM tasks;"

# Check environment
echo $LENS_API_URL
```

---

## 🧹 Cleanup Test Data

After testing, clean up:

### SQL Script
```sql
-- tests/scripts/cleanup-test-data.sql
DELETE FROM notifications WHERE user_profile_id LIKE '%test%';
DELETE FROM task_applications WHERE applicant_profile_id LIKE '%test%';
DELETE FROM tasks WHERE employer_profile_id LIKE '%test%';
DELETE FROM users WHERE profile_id LIKE '%test%';
```

Run:
```bash
psql -U postgres -d slice_db -f tests/scripts/cleanup-test-data.sql
```

### Or use Postman request
Add a "Cleanup" folder with DELETE requests for test data.

---

## 🚀 CI/CD Integration

### GitHub Actions
```yaml
# .github/workflows/api-tests.yml
name: API Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Install Newman
        run: npm install -g newman
      
      - name: Run API Tests
        run: |
          newman run tests/postman/Slice_API_Collection.postman_collection.json \
            --environment tests/postman/Slice_API_Local.postman_environment.json \
            --reporters cli,json \
            --reporter-json-export test-results.json
      
      - name: Upload Results
        uses: actions/upload-artifact@v2
        with:
          name: test-results
          path: test-results.json
```

---

## 📚 Additional Resources

- **Postman Learning**: https://learning.postman.com/
- **Newman Documentation**: https://github.com/postmanlabs/newman
- **API Flow Docs**: `docs/API_FLOW.md`
- **Postman Guide**: `tests/postman/README.md`

---

**Last Updated**: November 10, 2025
