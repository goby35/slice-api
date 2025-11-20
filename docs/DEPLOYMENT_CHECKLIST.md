# 🚀 Deployment Checklist - Escrow Improved Contract

## Pre-Deployment

### 1. Code Verification
- [x] ✅ `blockchainService.ts` - ABI updated (11 entries)
- [x] ✅ `blockchainService.ts` - Cancelled event listener added
- [x] ✅ `blockchainService.ts` - `cancelEscrow()` function added
- [x] ✅ `blockchainService.ts` - `releaseAfterDeadline()` function added
- [x] ✅ `escrow.ts` - Import `cancelEscrow` added
- [x] ✅ `escrow.ts` - Cancel endpoint updated to use `cancelEscrow()`
- [x] ✅ `deadline-automation.mjs` - ABI updated to use `releaseAfterDeadline()`
- [x] ✅ `deadline-automation.mjs` - Helper functions updated
- [x] ✅ TypeScript compilation - No errors
- [x] ✅ Documentation created (4 files)

### 2. Contract Preparation
- [ ] 📝 Review improved Solidity contract code
- [ ] 📝 Compile contract: `npx hardhat compile`
- [ ] 📝 Run unit tests: `npx hardhat test`
- [ ] 📝 Verify all 4 deadline cases work correctly

---

## Deployment Steps

### Step 1: Deploy Improved Contract

#### Option A: Local Hardhat Node (Testing)
```bash
# Terminal 1: Start local node
cd blockchain
npx hardhat node

# Terminal 2: Deploy contract
npx hardhat run scripts/deploy.js --network localhost

# Save output:
# - CONTRACT_ADDRESS: 0x...
# - Token address: 0x...
# - Admin address: 0x...
```

#### Option B: Testnet (Sepolia/Mumbai)
```bash
cd blockchain
npx hardhat run scripts/deploy.js --network sepolia

# Note: Cần có ETH/MATIC testnet trong deployer wallet
# Lấy từ faucet nếu cần
```

### Step 2: Update Environment Variables

```bash
# .env (root của slice-api)
CONTRACT_ADDRESS=0x...  # ← NEW contract address
RPC_URL=http://127.0.0.1:8545  # hoặc testnet RPC
ADMIN_PRIVATE_KEY=0x...
```

### Step 3: Verify Contract on Blockchain Explorer (Testnet only)

```bash
npx hardhat verify --network sepolia 0x... <constructor-args>
```

---

## Testing Phase

### Test 1: Event Listeners
```bash
# Start backend
cd slice-api
pnpm dev

# Expected console output:
# ✅ Blockchain initialized
# ✅ Event listeners started (Deposited, Released, Cancelled)
```

### Test 2: Cancel Before Deadline
```bash
# Create a task with escrow
curl -X POST http://localhost:3000/tasks \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Task",
    "deadline": "2024-12-31T00:00:00Z",
    "rewardPoints": 100
  }'

# Deposit escrow (via blockchain or API)

# Cancel before deadline
curl -X POST http://localhost:3000/escrow/cancel \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task-uuid",
    "reason": "Testing cancel function"
  }'

# Expected:
# ✅ Transaction succeeds
# ✅ Backend logs "🚫 Cancelled event"
# ✅ DB updated: escrowTasks.settled = true
# ✅ Tokens refunded to employer
```

### Test 3: Cancel After Deadline (Should Fail)
```bash
# Try to cancel after deadline passes
curl -X POST http://localhost:3000/escrow/cancel \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "taskId": "expired-task-uuid", "reason": "Late cancel" }'

# Expected:
# ❌ Backend returns 400: "Cannot cancel after deadline"
# ✅ Contract reverts if somehow called directly
```

### Test 4: Deadline Automation
```bash
# Setup: Create task with deadline in past
# Insert expired escrow task vào DB

# Run automation script
node scripts/deadline-automation.mjs

# Expected:
# Case 1 (in_review): 
#   ✅ Calls releaseAfterDeadline(freelancer)
#   ✅ Task marked as completed

# Case 2 (cancelled):
#   ✅ Calls releaseAfterDeadline(employer)
#   ✅ Task already cancelled, skip

# Case 3 (accepted/needs_revision):
#   ✅ Calls releaseAfterDeadline(employer)
#   ✅ Task marked as cancelled
```

### Test 5: Full Integration Test
```bash
# Run automated test script
node scripts/test-escrow-flow.mjs

# Expected:
# ✅ Mint tokens to test accounts
# ✅ Create task with externalTaskId
# ✅ Deposit escrow
# ✅ Verify escrow in DB
# ✅ Complete task
# ✅ Release tokens
# ✅ Verify settled status
```

---

## Post-Deployment Verification

### 1. Database Checks
```sql
-- Check escrow_tasks table
SELECT 
  taskId,
  externalTaskId,
  employer,
  freelancer,
  amount,
  deadline,
  settled,
  releaseTo,
  releaseReason
FROM escrow_tasks
WHERE settled = true
ORDER BY releasedAt DESC
LIMIT 5;

-- Verify Cancelled events synced
SELECT * FROM escrow_tasks
WHERE releaseReason LIKE 'Cancelled:%'
LIMIT 5;
```

### 2. Contract State Verification
```javascript
// scripts/verify-contract.mjs
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

// Check task count
const taskCount = await contract.taskCount();
console.log('Total tasks:', taskCount.toString());

// Check specific escrow
const escrow = await contract.escrows(1);
console.log('Escrow 1:', {
  employer: escrow.employer,
  freelancer: escrow.freelancer,
  amount: escrow.amount.toString(),
  deadline: new Date(Number(escrow.deadline) * 1000),
  settled: escrow.settled,
  externalTaskId: escrow.externalTaskId
});
```

### 3. Event History Verification
```javascript
// Check past events
const depositedEvents = await contract.queryFilter('Deposited');
const releasedEvents = await contract.queryFilter('Released');
const cancelledEvents = await contract.queryFilter('Cancelled');

console.log('Deposited:', depositedEvents.length);
console.log('Released:', releasedEvents.length);
console.log('Cancelled:', cancelledEvents.length);
```

---

## Production Setup

### 1. Cron Job Configuration

#### Linux/Mac (crontab)
```bash
# Edit crontab
crontab -e

# Add entry to run every hour
0 * * * * cd /path/to/slice-api && node scripts/deadline-automation.mjs >> /var/log/deadline-automation.log 2>&1
```

#### Windows (Task Scheduler)
```powershell
# Create scheduled task
$action = New-ScheduledTaskAction -Execute "node" -Argument "D:\INTERN\Lens\slice-api\scripts\deadline-automation.mjs"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName "EscrowDeadlineAutomation" -Action $action -Trigger $trigger
```

### 2. Monitoring Setup

#### PM2 (Node.js process manager)
```bash
# Install PM2
npm install -g pm2

# Start backend with PM2
pm2 start pnpm --name "slice-api" -- dev

# Start cron job
pm2 start scripts/deadline-automation.mjs --name "deadline-automation" --cron "0 * * * *"

# View logs
pm2 logs slice-api
pm2 logs deadline-automation
```

### 3. Logging & Alerts

#### Create log aggregation script
```javascript
// scripts/monitor-escrow.mjs
// Aggregate escrow metrics and send alerts

import { db } from '../src/db/index.js';
import { escrowTasks } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function getEscrowMetrics() {
  // Total escrow value
  const totalValue = await db
    .select({ sum: sql`SUM(amount)` })
    .from(escrowTasks)
    .where(eq(escrowTasks.settled, false));

  // Expired but not settled
  const now = Math.floor(Date.now() / 1000);
  const expiredUnsettled = await db
    .select()
    .from(escrowTasks)
    .where(
      and(
        eq(escrowTasks.settled, false),
        lt(escrowTasks.deadline, now)
      )
    );

  return {
    totalValue: totalValue[0]?.sum || 0,
    expiredUnsettled: expiredUnsettled.length,
    timestamp: new Date().toISOString()
  };
}

// Send to monitoring service (Datadog, Sentry, etc.)
```

---

## Rollback Plan

### If Issues Found After Deployment

#### 1. Emergency: Revert to old contract
```bash
# Update .env with old CONTRACT_ADDRESS
CONTRACT_ADDRESS=0x..._OLD_CONTRACT

# Restart backend
pm2 restart slice-api
```

#### 2. Code-level rollback
```bash
git checkout HEAD~1 src/services/blockchainService.ts
git checkout HEAD~1 src/routes/escrow.ts
git checkout HEAD~1 scripts/deadline-automation.mjs

pnpm dev
```

#### 3. Database rollback (if needed)
```sql
-- No schema changes, only data changes
-- Cancelled events might be in DB, safe to ignore
-- No rollback needed unless corrupted
```

---

## Success Criteria

- [ ] ✅ Contract deployed successfully
- [ ] ✅ Backend connects to new contract
- [ ] ✅ All 3 event listeners active
- [ ] ✅ Cancel endpoint works (before deadline)
- [ ] ✅ Cancel endpoint rejects (after deadline)
- [ ] ✅ Deadline automation runs successfully
- [ ] ✅ Cancelled events sync to DB
- [ ] ✅ Full integration test passes
- [ ] ✅ Cron job scheduled and running
- [ ] ✅ Monitoring/logging configured
- [ ] ✅ Documentation updated

---

## Support & Troubleshooting

### Common Issues

#### Issue 1: Event listeners not starting
```bash
# Check RPC connection
curl -X POST $RPC_URL -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Check contract address
# Verify in .env matches deployed contract
```

#### Issue 2: Deadline automation fails
```bash
# Check admin private key has funds (gas)
# Check contract ABI matches deployed contract
# Check database connectivity

# Run manually for debugging
node scripts/deadline-automation.mjs
```

#### Issue 3: Cancel transaction reverts
```bash
# Possible reasons:
# - Deadline already passed (check on-chain timestamp)
# - Not employer/admin (check caller address)
# - Task already settled (check escrow.settled)
```

---

## Documentation Links

- [ESCROW_BACKEND_INTEGRATION_COMPLETE.md](./ESCROW_BACKEND_INTEGRATION_COMPLETE.md) - Full backend changes
- [ESCROW_BEFORE_AFTER_COMPARISON.md](./ESCROW_BEFORE_AFTER_COMPARISON.md) - Code diffs
- [ESCROW_IMPROVED_CONTRACT.md](./ESCROW_IMPROVED_CONTRACT.md) - Contract design
- [ESCROW_TESTING_GUIDE.md](./ESCROW_TESTING_GUIDE.md) - Testing scenarios

---

**Deployment Date:** _____________  
**Deployed By:** _____________  
**Contract Address:** _____________  
**Network:** _____________  
**Status:** ⏳ Pending / ✅ Complete
