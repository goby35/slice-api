# 🧪 Quick Test Scripts for Escrow

## Setup
```powershell
# Terminal 1: Start Hardhat node
npx hardhat node

# Terminal 2: Deploy contracts
npx hardhat run scripts/deploy.js --network localhost

# Terminal 3: Start backend (with event listeners)
pnpm run dev

# Terminal 4: Run tests
node scripts/test-escrow-flow.mjs
```

---

## Manual Testing với cURL/PowerShell

### 1. Create Task
```powershell
$employerJWT = "eyJhbGc..." # your JWT token

$response = Invoke-RestMethod -Uri "http://localhost:3000/tasks" `
  -Method Post `
  -Headers @{ "Authorization" = "Bearer $employerJWT"; "Content-Type" = "application/json" } `
  -Body (@{
    title = "Build smart contract"
    objective = "Create escrow contract"
    deliverables = "Solidity code"
    acceptanceCriteria = "Passes all tests"
    rewardPoints = 100
    deadline = "2025-12-31T23:59:59Z"
  } | ConvertTo-Json)

$externalTaskId = $response.externalTaskId
Write-Host "External Task ID: $externalTaskId"
```

### 2. Approve + Deposit (Hardhat Console)
```powershell
npx hardhat console --network localhost
```

```javascript
const [admin, employer, freelancer] = await ethers.getSigners();

// Get contracts
const Token = await ethers.getContractAt("MockERC20", "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512");
const Escrow = await ethers.getContractAt("TaskEscrowPool", "0x5FbDB2315678afecb367f032d93F642f64180aa3");

// Mint tokens to employer
await Token.mint(employer.address, ethers.parseEther("1000"));

// Approve
await Token.connect(employer).approve(Escrow.target, ethers.parseEther("100"));

// Deposit (use externalTaskId from step 1)
const tx = await Escrow.connect(employer).deposit(
  ethers.parseEther("100"),
  freelancer.address,
  Math.floor(Date.now() / 1000) + 86400,
  "550e8400-e29b-41d4-a716-446655440000" // paste your externalTaskId
);

await tx.wait();
console.log("Deposited! Task ID:", await Escrow.taskCount());
```

### 3. Check Escrow Status
```powershell
$taskId = 1
Invoke-RestMethod -Uri "http://localhost:3000/escrow/task/$taskId"
```

### 4. Release Tokens
```powershell
$adminJWT = "eyJhbGc..." # admin JWT

Invoke-RestMethod -Uri "http://localhost:3000/escrow/release" `
  -Method Post `
  -Headers @{ "Authorization" = "Bearer $adminJWT"; "Content-Type" = "application/json" } `
  -Body (@{
    taskId = 1
    to = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" # freelancer address
    reason = "Task completed"
  } | ConvertTo-Json)
```

### 5. Verify Balance
```javascript
// Back to hardhat console
const balance = await Token.balanceOf(freelancer.address);
console.log("Freelancer balance:", ethers.formatEther(balance)); // Should be 100
```

---

## Test Scenarios

### ✅ Happy Path
1. Create task → get externalTaskId
2. Deposit → event listener syncs to DB
3. Release → token transferred, DB updated

### ❌ Error Cases

#### Duplicate externalTaskId
```javascript
// Try deposit with same externalTaskId
await Escrow.deposit(..., "same-external-id");
// → Reverts: "External ID exists"
```

#### Release to wrong address
```javascript
await Escrow.release(1, "0xRandomAddress", "test");
// → Reverts: "Receiver must be employer or freelancer"
```

#### Release without admin role
```javascript
await Escrow.connect(employer).release(1, freelancer.address, "test");
// → Reverts: "Caller is not an admin"
```

#### Release already settled task
```javascript
await Escrow.release(1, freelancer.address, "first");
await Escrow.release(1, freelancer.address, "second");
// → Reverts: "Task already settled"
```

---

## Monitoring Commands

### Check Backend Logs
```powershell
Get-Content logs/blockchain.log -Wait -Tail 20
```

### Check DB State
```powershell
# Connect to DB
psql $env:DATABASE_URL

# Query escrow tasks
SELECT task_id, external_task_id, settled, amount FROM escrow_tasks;

# Check sync status
SELECT 
  COUNT(*) as total_tasks,
  COUNT(CASE WHEN settled THEN 1 END) as settled_count,
  COUNT(CASE WHEN NOT settled THEN 1 END) as pending_count
FROM escrow_tasks;
```

### Query On-chain State
```javascript
// Hardhat console
const taskCount = await Escrow.taskCount();
console.log("Total on-chain tasks:", taskCount);

for (let i = 1; i <= taskCount; i++) {
  const task = await Escrow.escrows(i);
  console.log(`Task ${i}:`, {
    employer: task.employer,
    amount: ethers.formatEther(task.amount),
    settled: task.settled,
    externalId: task.externalId
  });
}
```

---

## Reconciliation (If events missed)

```powershell
# Run reconciliation script
node scripts/reconcile-escrow.mjs

# Or manual query past events
npx hardhat console --network localhost
```

```javascript
const Escrow = await ethers.getContractAt("TaskEscrowPool", "0x...");

// Get all Deposited events
const depositFilter = Escrow.filters.Deposited();
const deposits = await Escrow.queryFilter(depositFilter, 0, "latest");

deposits.forEach(event => {
  console.log("Deposited:", {
    taskId: event.args.taskId,
    externalId: event.args.externalId,
    amount: ethers.formatEther(event.args.amount),
    blockNumber: event.blockNumber
  });
});

// Get all Released events
const releaseFilter = Escrow.filters.Released();
const releases = await Escrow.queryFilter(releaseFilter, 0, "latest");

releases.forEach(event => {
  console.log("Released:", {
    taskId: event.args.taskId,
    to: event.args.to,
    amount: ethers.formatEther(event.args.amount)
  });
});
```

---

## Performance Testing

### Load Test Deposits
```javascript
// scripts/load-test-deposits.js
async function loadTest() {
  const tasks = 100;
  for (let i = 0; i < tasks; i++) {
    const externalId = crypto.randomUUID();
    await escrow.deposit(
      ethers.parseEther("10"),
      freelancer.address,
      deadline,
      externalId
    );
    if (i % 10 === 0) console.log(`Deposited ${i} tasks`);
  }
}
```

### Verify All Synced
```sql
-- Compare counts
SELECT 
  (SELECT COUNT(*) FROM escrow_tasks) as db_count,
  -- Should match contract.taskCount()
;
```

---

## Troubleshooting

### Event không bắt được
- Check RPC_URL đúng chưa
- Check CONTRACT_ADDRESS đúng chưa
- Xem log: `cat logs/blockchain.log`
- Chạy reconciliation

### Transaction failed
- Check gas limit
- Check token balance & allowance
- Check contract không paused

### DB không sync
- Check DB connection
- Check migration đã chạy chưa
- Check listener có start không

---

## Clean Up

```powershell
# Stop Hardhat node (Ctrl+C)
# Stop backend (Ctrl+C)

# Clear DB (if needed)
psql $env:DATABASE_URL -c "TRUNCATE escrow_tasks CASCADE;"

# Restart fresh
npx hardhat node
# Deploy again
# Start backend again
```
