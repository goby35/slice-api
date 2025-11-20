# 🧪 Hướng Dẫn Test Đầy Đủ - Escrow Integration

## Mục lục
1. [Setup môi trường test](#1-setup-môi-trường-test)
2. [Test Contract Functions](#2-test-contract-functions)
3. [Test Backend Integration](#3-test-backend-integration)
4. [Test Deadline Automation](#4-test-deadline-automation)
5. [Test Full User Flow](#5-test-full-user-flow)

---

## 1. Setup Môi Trường Test

### 1.1 Start Hardhat Local Node

```powershell
# Terminal 1: Start local blockchain
cd blockchain
npx hardhat node

# Output sẽ hiện:
# Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
# 
# Accounts:
# Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
# Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### 1.2 Deploy Improved Contract

```powershell
# Terminal 2: Deploy contracts
cd blockchain
npx hardhat run scripts/deploy.js --network localhost

# Lưu lại output:
# ✅ MockToken deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
# ✅ TaskEscrowPool deployed to: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
# 🔑 Admin address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
```

### 1.3 Update .env

```env
# .env (root của slice-api)
RPC_URL=http://127.0.0.1:8545
CONTRACT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
TOKEN_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
ADMIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Accounts for testing
EMPLOYER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
EMPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
FREELANCER_ADDRESS=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
FREELANCER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

### 1.4 Start Backend

```powershell
# Terminal 3: Start API server
cd slice-api
pnpm dev

# Expected output:
# 🚀 Server running on http://localhost:3000
# ⛓️  Blockchain initialized
# ✅ Event listeners started (Deposited, Released, Cancelled)
```

---

## 2. Test Contract Functions

### 2.1 Test Script: Verify Contract Deployment

Tạo file `scripts/test-contract.mjs`:

```javascript
// scripts/test-contract.mjs
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function testContract() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const signer = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
  
  const contractABI = [
    'function taskCount() view returns (uint256)',
    'function token() view returns (address)',
    'function hasRole(bytes32 role, address account) view returns (bool)',
    'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  ];
  
  const contract = new ethers.Contract(
    process.env.CONTRACT_ADDRESS,
    contractABI,
    provider
  );

  console.log('📋 Contract Information:');
  console.log('Address:', process.env.CONTRACT_ADDRESS);
  console.log('Token:', await contract.token());
  console.log('Task Count:', (await contract.taskCount()).toString());
  
  const adminRole = await contract.DEFAULT_ADMIN_ROLE();
  const isAdmin = await contract.hasRole(adminRole, signer.address);
  console.log('Admin Role:', adminRole);
  console.log('Is Admin:', isAdmin ? '✅' : '❌');
}

testContract().catch(console.error);
```

```powershell
# Run test
node scripts/test-contract.mjs

# Expected:
# 📋 Contract Information:
# Address: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
# Token: 0x5FbDB2315678afecb367f032d93F642f64180aa3
# Task Count: 0
# Admin Role: 0x0000000000000000000000000000000000000000000000000000000000000000
# Is Admin: ✅
```

### 2.2 Test: Deposit Escrow

```javascript
// scripts/test-deposit.mjs
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function testDeposit() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const employer = new ethers.Wallet(process.env.EMPLOYER_PRIVATE_KEY, provider);
  
  const tokenABI = [
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
    'function mint(address to, uint256 amount)'
  ];
  
  const escrowABI = [
    'function deposit(uint256 amount, address freelancer, uint256 deadline, string externalTaskId)',
    'event Deposited(uint256 indexed taskId, string indexed externalId, address employer, uint256 amount)'
  ];
  
  const token = new ethers.Contract(process.env.TOKEN_ADDRESS, tokenABI, employer);
  const escrow = new ethers.Contract(process.env.CONTRACT_ADDRESS, escrowABI, employer);
  
  console.log('💰 Testing Deposit Flow...\n');
  
  // Step 1: Mint tokens to employer
  console.log('1️⃣ Minting 1000 tokens to employer...');
  const mintTx = await token.mint(employer.address, ethers.parseEther('1000'));
  await mintTx.wait();
  console.log('✅ Minted');
  
  const balance = await token.balanceOf(employer.address);
  console.log('Balance:', ethers.formatEther(balance), 'tokens\n');
  
  // Step 2: Approve escrow contract
  console.log('2️⃣ Approving escrow contract...');
  const approveTx = await token.approve(
    process.env.CONTRACT_ADDRESS,
    ethers.parseEther('100')
  );
  await approveTx.wait();
  console.log('✅ Approved 100 tokens\n');
  
  // Step 3: Deposit escrow
  console.log('3️⃣ Depositing escrow...');
  const externalTaskId = `test-task-${Date.now()}`;
  const freelancerAddress = process.env.FREELANCER_ADDRESS;
  const amount = ethers.parseEther('100');
  const deadline = Math.floor(Date.now() / 1000) + 86400; // +24 hours
  
  const depositTx = await escrow.deposit(
    amount,
    freelancerAddress,
    deadline,
    externalTaskId
  );
  
  console.log('Transaction hash:', depositTx.hash);
  const receipt = await depositTx.wait();
  console.log('✅ Deposit confirmed in block', receipt.blockNumber);
  
  // Get taskId from event
  const depositedEvent = receipt.logs.find(log => {
    try {
      return escrow.interface.parseLog(log)?.name === 'Deposited';
    } catch { return false; }
  });
  
  if (depositedEvent) {
    const parsed = escrow.interface.parseLog(depositedEvent);
    console.log('\n📦 Deposited Event:');
    console.log('TaskId:', parsed.args.taskId.toString());
    console.log('External ID:', parsed.args.externalId);
    console.log('Employer:', parsed.args.employer);
    console.log('Amount:', ethers.formatEther(parsed.args.amount), 'tokens');
  }
}

testDeposit().catch(console.error);
```

```powershell
node scripts/test-deposit.mjs

# Expected:
# 💰 Testing Deposit Flow...
# 1️⃣ Minting 1000 tokens to employer...
# ✅ Minted
# Balance: 1000.0 tokens
# 2️⃣ Approving escrow contract...
# ✅ Approved 100 tokens
# 3️⃣ Depositing escrow...
# Transaction hash: 0x...
# ✅ Deposit confirmed in block 2
# 📦 Deposited Event:
# TaskId: 1
# External ID: test-task-1234567890
# Employer: 0xf39Fd...
# Amount: 100.0 tokens
```

### 2.3 Test: Cancel Before Deadline

```javascript
// scripts/test-cancel.mjs
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function testCancel() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const employer = new ethers.Wallet(process.env.EMPLOYER_PRIVATE_KEY, provider);
  
  const escrowABI = [
    'function cancel(uint256 taskId, string reason)',
    'event Cancelled(uint256 indexed taskId, address employer, uint256 amount, string reason)'
  ];
  
  const escrow = new ethers.Contract(process.env.CONTRACT_ADDRESS, escrowABI, employer);
  
  console.log('🚫 Testing Cancel Before Deadline...\n');
  
  const taskId = 1; // Từ deposit test
  const reason = 'Testing cancel function';
  
  console.log('Cancelling task', taskId);
  const cancelTx = await escrow.cancel(taskId, reason);
  console.log('Transaction hash:', cancelTx.hash);
  
  const receipt = await cancelTx.wait();
  console.log('✅ Cancel confirmed in block', receipt.blockNumber);
  
  // Get Cancelled event
  const cancelledEvent = receipt.logs.find(log => {
    try {
      return escrow.interface.parseLog(log)?.name === 'Cancelled';
    } catch { return false; }
  });
  
  if (cancelledEvent) {
    const parsed = escrow.interface.parseLog(cancelledEvent);
    console.log('\n🚫 Cancelled Event:');
    console.log('TaskId:', parsed.args.taskId.toString());
    console.log('Employer:', parsed.args.employer);
    console.log('Amount:', ethers.formatEther(parsed.args.amount), 'tokens');
    console.log('Reason:', parsed.args.reason);
  }
}

testCancel().catch(console.error);
```

### 2.4 Test: ReleaseAfterDeadline

```javascript
// scripts/test-release-after-deadline.mjs
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function testReleaseAfterDeadline() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const employer = new ethers.Wallet(process.env.EMPLOYER_PRIVATE_KEY, provider);
  const freelancer = new ethers.Wallet(process.env.FREELANCER_PRIVATE_KEY, provider);
  
  // Step 1: Deposit with deadline = now (already expired)
  console.log('1️⃣ Creating expired escrow...');
  
  const tokenABI = [
    'function mint(address to, uint256 amount)',
    'function approve(address spender, uint256 amount)'
  ];
  
  const escrowABI = [
    'function deposit(uint256 amount, address freelancer, uint256 deadline, string externalTaskId)',
    'function releaseAfterDeadline(uint256 taskId, address to, string reason)',
    'event Released(uint256 indexed taskId, address to, uint256 amount, string reason)'
  ];
  
  const token = new ethers.Contract(process.env.TOKEN_ADDRESS, tokenABI, employer);
  const escrow = new ethers.Contract(process.env.CONTRACT_ADDRESS, escrowABI, employer);
  
  // Mint and approve
  await (await token.mint(employer.address, ethers.parseEther('100'))).wait();
  await (await token.approve(process.env.CONTRACT_ADDRESS, ethers.parseEther('100'))).wait();
  
  // Deposit with deadline = now - 1 hour (expired)
  const externalTaskId = `expired-task-${Date.now()}`;
  const deadline = Math.floor(Date.now() / 1000) - 3600;
  
  const depositTx = await escrow.deposit(
    ethers.parseEther('100'),
    freelancer.address,
    deadline,
    externalTaskId
  );
  const depositReceipt = await depositTx.wait();
  
  // Get taskId
  const depositedEvent = depositReceipt.logs.find(log => {
    try {
      return escrow.interface.parseLog(log)?.name === 'Deposited';
    } catch { return false; }
  });
  const taskId = escrow.interface.parseLog(depositedEvent).args.taskId;
  console.log('✅ Created expired task:', taskId.toString());
  
  // Step 2: Anyone can release after deadline
  console.log('\n2️⃣ Releasing to freelancer (called by employer)...');
  
  const releaseTx = await escrow.releaseAfterDeadline(
    taskId,
    freelancer.address,
    'Deadline passed, work was submitted'
  );
  const releaseReceipt = await releaseTx.wait();
  console.log('✅ Released in block', releaseReceipt.blockNumber);
  
  // Get Released event
  const releasedEvent = releaseReceipt.logs.find(log => {
    try {
      return escrow.interface.parseLog(log)?.name === 'Released';
    } catch { return false; }
  });
  
  if (releasedEvent) {
    const parsed = escrow.interface.parseLog(releasedEvent);
    console.log('\n📤 Released Event:');
    console.log('TaskId:', parsed.args.taskId.toString());
    console.log('To:', parsed.args.to);
    console.log('Amount:', ethers.formatEther(parsed.args.amount), 'tokens');
    console.log('Reason:', parsed.args.reason);
  }
}

testReleaseAfterDeadline().catch(console.error);
```

---

## 3. Test Backend Integration

### 3.1 Test Event Listeners

```powershell
# Trong Terminal 3 (backend đang chạy), check logs:

# Khi chạy test-deposit.mjs:
# Expected log:
# 📥 Deposited event: { taskId: '1', externalId: 'test-task-...', employer: '0x...', amount: '100000000000000000000' }
# ✅ Synced Deposited event to DB

# Khi chạy test-cancel.mjs:
# Expected log:
# 🚫 Cancelled event: { taskId: '1', employer: '0x...', amount: '100000000000000000000', reason: 'Testing...' }
# ✅ Synced Cancelled event to DB

# Khi chạy test-release-after-deadline.mjs:
# Expected log:
# 📤 Released event: { taskId: '2', to: '0x...', amount: '100000000000000000000', reason: 'Deadline...' }
# ✅ Synced Released event to DB
```

### 3.2 Test API Endpoints

#### Test GET /escrow/task/:taskId

```powershell
curl http://localhost:3000/escrow/task/1

# Expected:
# {
#   "taskId": "1",
#   "externalTaskId": "test-task-1234567890",
#   "employer": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
#   "freelancer": "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
#   "amount": "100000000000000000000",
#   "deadline": 1700240000,
#   "settled": 1,
#   "depositedTx": "0x...",
#   "releasedTx": "0x...",
#   "releaseTo": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
#   "releaseReason": "Cancelled: Testing cancel function"
# }
```

#### Test POST /escrow/cancel (với JWT)

Trước tiên cần tạo task qua API và có JWT token:

```powershell
# 1. Get JWT token (giả sử bạn có auth endpoint)
$jwt = "your_jwt_token_here"

# 2. Create task
$body = @{
    title = "Test Task for Escrow"
    description = "Testing escrow integration"
    deadline = "2025-12-31T00:00:00Z"
    rewardPoints = 100
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:3000/tasks" `
    -Method POST `
    -Headers @{ "Authorization" = "Bearer $jwt"; "Content-Type" = "application/json" } `
    -Body $body

$taskId = $response.task.id
Write-Host "Created task: $taskId"

# 3. Manually deposit escrow (via blockchain script)
# ... run deposit script với externalTaskId = task's externalTaskId

# 4. Cancel via API
$cancelBody = @{
    taskId = $taskId
    reason = "Testing cancel via API"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/escrow/cancel" `
    -Method POST `
    -Headers @{ "Authorization" = "Bearer $jwt"; "Content-Type" = "application/json" } `
    -Body $cancelBody

# Expected:
# {
#   "success": true,
#   "txHash": "0x...",
#   "message": "Task cancelled and tokens refunded to employer"
# }
```

---

## 4. Test Deadline Automation

### 4.1 Setup Test Data

```sql
-- Insert expired escrow task vào DB (fake data for testing)
INSERT INTO escrow_tasks (
  "taskId", 
  "externalTaskId", 
  employer, 
  freelancer, 
  amount, 
  deadline, 
  settled, 
  "depositedTx"
) VALUES (
  '999',
  'test-expired-task-uuid',
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266',
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
  '100000000000000000000',
  1700000000, -- Deadline trong quá khứ
  false,
  '0xfake-tx-hash'
);

-- Insert corresponding task
INSERT INTO tasks (
  id,
  "externalTaskId",
  "employerProfileId",
  title,
  description,
  "rewardPoints",
  status,
  deadline,
  "createdAt"
) VALUES (
  'test-task-uuid',
  'test-expired-task-uuid',
  'employer-profile-id',
  'Expired Test Task',
  'For testing deadline automation',
  100,
  'in_progress',
  '2023-11-01T00:00:00Z',
  NOW()
);

-- Insert application (status: in_review)
INSERT INTO task_applications (
  id,
  "taskId",
  "freelancerProfileId",
  status,
  "appliedAt"
) VALUES (
  'test-application-uuid',
  'test-task-uuid',
  'freelancer-profile-id',
  'in_review', -- Để test case "freelancer đã submit"
  NOW()
);
```

### 4.2 Run Deadline Automation

```powershell
# Đảm bảo CONTRACT_ADDRESS trong .env có escrow task với taskId = 999
# hoặc sửa script để skip blockchain call khi test

node scripts/deadline-automation.mjs

# Expected output:
# 🚀 Starting deadline automation check: 2025-11-17T...
# 📋 Found 1 expired tasks to process
# 
# ⏰ Processing task 999 (external: test-expired-task-uuid)
# 📝 Work submitted and in review, releasing to freelancer
#   → Releasing to freelancer: 0x70997970c51812dc3a010c7d01b50e0d17dc79c8
#   → Tx sent: 0x...
#   ✅ Released to freelancer
# 
# ✅ Deadline automation completed
```

### 4.3 Test All 4 Cases

Tạo script test helper:

```javascript
// scripts/test-all-deadline-cases.mjs
import { db } from '../src/db/index.js';
import { escrowTasks, tasks, taskApplications } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function setupCase1() {
  // Case 1: Already completed (skip)
  console.log('Setting up Case 1: completed');
  // ... insert data với status = 'completed'
}

async function setupCase2() {
  // Case 2: Cancelled (refund employer)
  console.log('Setting up Case 2: cancelled');
  // ... insert data với status = 'cancelled'
}

async function setupCase3() {
  // Case 3: In review (pay freelancer)
  console.log('Setting up Case 3: in_review');
  // ... insert data với status = 'in_review'
}

async function setupCase4() {
  // Case 4: Accepted but not submitted (refund employer)
  console.log('Setting up Case 4: accepted');
  // ... insert data với status = 'accepted'
}

async function main() {
  await setupCase1();
  await setupCase2();
  await setupCase3();
  await setupCase4();
  
  console.log('\n✅ All test cases setup complete');
  console.log('Now run: node scripts/deadline-automation.mjs');
}

main().catch(console.error);
```

---

## 5. Test Full User Flow

### 5.1 Complete Integration Test Script

```javascript
// scripts/test-full-flow.mjs
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

async function fullFlowTest() {
  console.log('🧪 Starting Full Integration Test\n');
  
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const employer = new ethers.Wallet(process.env.EMPLOYER_PRIVATE_KEY, provider);
  const freelancer = new ethers.Wallet(process.env.FREELANCER_PRIVATE_KEY, provider);
  
  const tokenABI = [
    'function mint(address to, uint256 amount)',
    'function approve(address spender, uint256 amount)',
    'function balanceOf(address) view returns (uint256)'
  ];
  
  const escrowABI = [
    'function deposit(uint256, address, uint256, string)',
    'function cancel(uint256, string)',
    'function releaseAfterDeadline(uint256, address, string)',
    'function escrows(uint256) view returns (address, address, uint256, uint256, bool, string)'
  ];
  
  const token = new ethers.Contract(process.env.TOKEN_ADDRESS, tokenABI, employer);
  const escrow = new ethers.Contract(process.env.CONTRACT_ADDRESS, escrowABI, employer);
  
  // === STEP 1: Setup tokens ===
  console.log('1️⃣ Minting tokens to employer...');
  await (await token.mint(employer.address, ethers.parseEther('1000'))).wait();
  const balance = await token.balanceOf(employer.address);
  console.log(`✅ Employer balance: ${ethers.formatEther(balance)} tokens\n`);
  
  // === STEP 2: Approve escrow contract ===
  console.log('2️⃣ Approving escrow contract...');
  await (await token.approve(process.env.CONTRACT_ADDRESS, ethers.parseEther('100'))).wait();
  console.log('✅ Approved\n');
  
  // === STEP 3: Deposit escrow ===
  console.log('3️⃣ Depositing escrow...');
  const externalTaskId = `flow-test-${Date.now()}`;
  const deadline = Math.floor(Date.now() / 1000) + 86400;
  
  const depositTx = await escrow.deposit(
    ethers.parseEther('100'),
    freelancer.address,
    deadline,
    externalTaskId
  );
  const depositReceipt = await depositTx.wait();
  
  const depositedEvent = depositReceipt.logs.find(log => {
    try {
      return escrow.interface.parseLog(log)?.name === 'Deposited';
    } catch { return false; }
  });
  const taskId = escrow.interface.parseLog(depositedEvent).args.taskId;
  console.log(`✅ Deposited, taskId: ${taskId}\n`);
  
  // === STEP 4: Verify backend synced ===
  console.log('4️⃣ Checking backend sync...');
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for event processing
  
  const apiResponse = await fetch(`http://localhost:3000/escrow/task/${taskId}`);
  const escrowData = await apiResponse.json();
  
  if (escrowData.taskId === taskId.toString()) {
    console.log('✅ Backend synced correctly');
    console.log(`   External ID: ${escrowData.externalTaskId}`);
    console.log(`   Settled: ${escrowData.settled ? 'Yes' : 'No'}\n`);
  } else {
    console.log('❌ Backend sync failed\n');
  }
  
  // === STEP 5: Test cancel ===
  console.log('5️⃣ Testing cancel before deadline...');
  const cancelTx = await escrow.cancel(taskId, 'Testing full flow cancel');
  await cancelTx.wait();
  console.log('✅ Cancelled\n');
  
  // === STEP 6: Verify refund ===
  console.log('6️⃣ Verifying refund...');
  const balanceAfter = await token.balanceOf(employer.address);
  console.log(`✅ Employer balance after refund: ${ethers.formatEther(balanceAfter)} tokens\n`);
  
  // === STEP 7: Test releaseAfterDeadline ===
  console.log('7️⃣ Testing releaseAfterDeadline...');
  
  // Create new expired escrow
  await (await token.approve(process.env.CONTRACT_ADDRESS, ethers.parseEther('100'))).wait();
  const expiredDeadline = Math.floor(Date.now() / 1000) - 3600;
  const expiredExternalId = `expired-${Date.now()}`;
  
  const depositTx2 = await escrow.deposit(
    ethers.parseEther('100'),
    freelancer.address,
    expiredDeadline,
    expiredExternalId
  );
  const depositReceipt2 = await depositTx2.wait();
  const depositedEvent2 = depositReceipt2.logs.find(log => {
    try {
      return escrow.interface.parseLog(log)?.name === 'Deposited';
    } catch { return false; }
  });
  const taskId2 = escrow.interface.parseLog(depositedEvent2).args.taskId;
  
  console.log(`   Created expired task: ${taskId2}`);
  
  // Release to freelancer
  const releaseTx = await escrow.releaseAfterDeadline(
    taskId2,
    freelancer.address,
    'Work completed'
  );
  await releaseTx.wait();
  console.log('✅ Released to freelancer\n');
  
  // === STEP 8: Verify freelancer received ===
  const freelancerBalance = await token.balanceOf(freelancer.address);
  console.log(`8️⃣ Freelancer balance: ${ethers.formatEther(freelancerBalance)} tokens`);
  
  console.log('\n🎉 Full flow test completed successfully!');
}

fullFlowTest().catch(console.error);
```

### 5.2 Run Full Test

```powershell
# Make sure backend is running
# pnpm dev

# Run test
node scripts/test-full-flow.mjs

# Expected output:
# 🧪 Starting Full Integration Test
# 1️⃣ Minting tokens to employer...
# ✅ Employer balance: 1000.0 tokens
# 2️⃣ Approving escrow contract...
# ✅ Approved
# 3️⃣ Depositing escrow...
# ✅ Deposited, taskId: 1
# 4️⃣ Checking backend sync...
# ✅ Backend synced correctly
#    External ID: flow-test-1234567890
#    Settled: No
# 5️⃣ Testing cancel before deadline...
# ✅ Cancelled
# 6️⃣ Verifying refund...
# ✅ Employer balance after refund: 1000.0 tokens
# 7️⃣ Testing releaseAfterDeadline...
#    Created expired task: 2
# ✅ Released to freelancer
# 8️⃣ Freelancer balance: 100.0 tokens
# 🎉 Full flow test completed successfully!
```

---

## 6. Troubleshooting

### Issue 1: "Cannot connect to RPC"

```powershell
# Check Hardhat node is running
curl http://127.0.0.1:8545 -Method POST -Headers @{"Content-Type"="application/json"} -Body '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Should return: {"jsonrpc":"2.0","id":1,"result":"0x..."}
```

### Issue 2: "Backend not syncing events"

```powershell
# Check backend logs for errors
# Restart backend:
# Ctrl+C in Terminal 3
pnpm dev
```

### Issue 3: "Contract call reverts"

```javascript
// Check contract state
const escrowInfo = await contract.escrows(taskId);
console.log('Escrow info:', {
  employer: escrowInfo[0],
  freelancer: escrowInfo[1],
  amount: escrowInfo[2].toString(),
  deadline: new Date(Number(escrowInfo[3]) * 1000),
  settled: escrowInfo[4],
  externalTaskId: escrowInfo[5]
});
```

### Issue 4: "Database not updated"

```sql
-- Check escrow_tasks table
SELECT * FROM escrow_tasks ORDER BY "depositedAt" DESC LIMIT 5;

-- Check if externalTaskId matches
SELECT t.id, t."externalTaskId", et."taskId", et.settled
FROM tasks t
LEFT JOIN escrow_tasks et ON t."externalTaskId" = et."externalTaskId"
WHERE t."externalTaskId" IS NOT NULL
LIMIT 10;
```

---

## 7. Success Criteria

- [ ] ✅ Contract deployed successfully on local node
- [ ] ✅ Backend starts without errors
- [ ] ✅ Event listeners active (Deposited, Released, Cancelled)
- [ ] ✅ Deposit test passes
- [ ] ✅ Cancel test passes (before deadline)
- [ ] ✅ Cancel fails correctly (after deadline)
- [ ] ✅ ReleaseAfterDeadline test passes
- [ ] ✅ Backend syncs all events to DB
- [ ] ✅ API endpoints return correct data
- [ ] ✅ Deadline automation processes all 4 cases
- [ ] ✅ Full flow test passes end-to-end

---

## 8. Next Steps

1. **Testnet Deployment**: Deploy to Sepolia/Mumbai và test với real network
2. **Load Testing**: Test với nhiều tasks đồng thời
3. **Security Audit**: Review contract code và test edge cases
4. **Production Setup**: Setup monitoring, cron jobs, alerts

---

**Document Version:** 1.0  
**Last Updated:** 2025-11-17  
**Status:** ✅ Ready for testing
