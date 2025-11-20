# Quick Test Commands

## Prerequisites

```powershell
# Terminal 1: Start Hardhat local node
cd blockchain
npx hardhat node

# Terminal 2: Deploy contracts (copy CONTRACT_ADDRESS và TOKEN_ADDRESS)
cd blockchain
npx hardhat run scripts/deploy.js --network localhost

# Terminal 3: Update .env và start backend
cd slice-api
# Edit .env với CONTRACT_ADDRESS và TOKEN_ADDRESS mới
pnpm dev
```

---

## Quick Test Flow

### 1. Verify Contract Deployment
```powershell
node scripts/test-contract.mjs
```
**Expected:** Contract info, admin verification ✅

---

### 2. Test Deposit
```powershell
node scripts/test-deposit.mjs
```
**Expected:** 
- Mint tokens ✅
- Approve contract ✅
- Deposit escrow ✅
- **Save taskId from output!**

---

### 3. Test Cancel (before deadline)
```powershell
# Replace <taskId> with taskId from step 2
node scripts/test-cancel.mjs <taskId>

# Example:
node scripts/test-cancel.mjs 1
```
**Expected:** 
- Cancel transaction ✅
- Refund to employer ✅
- Backend logs "🚫 Cancelled event"

---

### 4. Test ReleaseAfterDeadline
```powershell
node scripts/test-release-after-deadline.mjs
```
**Expected:**
- Create expired escrow ✅
- Release to freelancer ✅
- Backend logs "📤 Released event"

---

### 5. Test Full Integration Flow
```powershell
node scripts/test-full-flow.mjs
```
**Expected:**
- Deposit → Cancel → Refund ✅
- Deposit expired → Release ✅
- All balances correct ✅

---

## Test Deadline Automation

### Setup test data
```sql
-- Run in Supabase SQL editor or psql
INSERT INTO tasks (id, "externalTaskId", "employerProfileId", title, status, deadline, "rewardPoints", "createdAt")
VALUES ('test-task-uuid', 'test-expired-ext-id', 'emp-profile-id', 'Expired Test', 'in_progress', '2023-11-01T00:00:00Z', 100, NOW());

INSERT INTO task_applications (id, "taskId", "freelancerProfileId", status, "appliedAt")
VALUES ('test-app-uuid', 'test-task-uuid', 'freelancer-profile-id', 'in_review', NOW());

INSERT INTO escrow_tasks ("taskId", "externalTaskId", employer, freelancer, amount, deadline, settled, "depositedTx")
VALUES ('999', 'test-expired-ext-id', '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', '100000000000000000000', 1700000000, false, '0xfake-tx');
```

### Run automation
```powershell
node scripts/deadline-automation.mjs
```
**Expected:**
- Find 1 expired task ✅
- Release to freelancer (in_review status) ✅
- Update DB ✅

---

## Test Backend API

### Get escrow info
```powershell
curl http://localhost:3000/escrow/task/1
```

### Cancel via API (needs JWT)
```powershell
$jwt = "your_jwt_token"
$body = @{ taskId = "task-uuid"; reason = "Testing" } | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/escrow/cancel" `
    -Method POST `
    -Headers @{ "Authorization" = "Bearer $jwt"; "Content-Type" = "application/json" } `
    -Body $body
```

---

## Verify Backend Event Sync

### Check backend logs (Terminal 3)
```
Expected logs after running tests:

📥 Deposited event: { taskId: '1', externalId: 'test-task-...', ... }
✅ Synced Deposited event to DB

🚫 Cancelled event: { taskId: '1', employer: '0x...', ... }
✅ Synced Cancelled event to DB

📤 Released event: { taskId: '2', to: '0x...', ... }
✅ Synced Released event to DB
```

### Check database
```sql
-- Verify escrow_tasks table
SELECT 
    "taskId",
    "externalTaskId",
    amount,
    settled,
    "releaseTo",
    "releaseReason"
FROM escrow_tasks
ORDER BY "depositedAt" DESC
LIMIT 5;
```

---

## Troubleshooting

### Contract call reverts
```powershell
# Check escrow state
node -e "
import('ethers').then(async ({ ethers }) => {
  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const abi = ['function escrows(uint256) view returns (address, address, uint256, uint256, bool, string)'];
  const contract = new ethers.Contract('CONTRACT_ADDRESS', abi, provider);
  const info = await contract.escrows(1);
  console.log('Escrow 1:', info);
});
"
```

### Backend not syncing
```powershell
# Restart backend
# Ctrl+C in Terminal 3
pnpm dev

# Check RPC connection
curl -Method POST http://127.0.0.1:8545 `
    -Headers @{"Content-Type"="application/json"} `
    -Body '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### Events not showing
```powershell
# Check backend console for:
# ⛓️  Blockchain initialized
# ✅ Event listeners started (Deposited, Released, Cancelled)

# If missing, check .env variables:
# RPC_URL
# CONTRACT_ADDRESS
# ADMIN_PRIVATE_KEY
```

---

## Success Criteria Checklist

- [ ] ✅ test-contract.mjs passes
- [ ] ✅ test-deposit.mjs passes (save taskId)
- [ ] ✅ test-cancel.mjs passes with saved taskId
- [ ] ✅ test-release-after-deadline.mjs passes
- [ ] ✅ test-full-flow.mjs passes
- [ ] ✅ Backend logs show all 3 events synced
- [ ] ✅ Database has escrow_tasks records
- [ ] ✅ deadline-automation.mjs processes expired tasks

---

## Next Steps After Testing

1. **Deploy to testnet** (Sepolia/Mumbai)
2. **Setup production cron job** for deadline automation
3. **Add monitoring** (Datadog, Sentry)
4. **Load testing** with multiple concurrent tasks
5. **Security audit** of contract and backend

---

**Quick Reference:**
- Test scripts: `scripts/test-*.mjs`
- Documentation: `docs/TEST_GUIDE.md`
- Full deployment: `docs/DEPLOYMENT_CHECKLIST.md`
