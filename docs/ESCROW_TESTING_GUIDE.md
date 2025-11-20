# 🧪 Hướng dẫn Test TaskEscrowPool Integration

## Chuẩn bị môi trường

### 1. Cài đặt Hardhat (local blockchain)
```bash
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init
```

### 2. Deploy contract local
```bash
# Trong thư mục contract của bạn
npx hardhat node  # Chạy local blockchain (cổng 8545)
npx hardhat run scripts/deploy.js --network localhost
```

Sau deploy, lấy:
- `CONTRACT_ADDRESS`: địa chỉ TaskEscrowPool
- `TOKEN_ADDRESS`: địa chỉ ERC20 token test
- `ADMIN_PRIVATE_KEY`: private key của admin account

### 3. Cập nhật `.env`
```env
RPC_URL=http://127.0.0.1:8545
CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
TOKEN_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
ADMIN_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
CHAIN_ID=31337
```

---

## 📝 Test Script Step-by-Step

### Bước 1: Mint token cho Employer
```javascript
// scripts/mint-tokens.js
const { ethers } = require("hardhat");

async function main() {
  const [deployer, employer] = await ethers.getSigners();
  const Token = await ethers.getContractAt("MockERC20", process.env.TOKEN_ADDRESS);
  
  await Token.mint(employer.address, ethers.parseEther("1000"));
  console.log(`Minted 1000 tokens to ${employer.address}`);
}

main();
```

### Bước 2: Test Full Flow với Postman/cURL

#### 2.1 Tạo Task (Backend API)
```bash
POST http://localhost:3000/tasks
Authorization: Bearer <EMPLOYER_JWT>
Content-Type: application/json

{
  "title": "Build landing page",
  "objective": "Create responsive landing page",
  "deliverables": "HTML/CSS/JS files",
  "acceptanceCriteria": "Mobile responsive",
  "rewardPoints": 100,
  "deadline": "2025-12-31T23:59:59Z"
}

# Response:
{
  "id": "uuid-task-1",
  "externalTaskId": "550e8400-e29b-41d4-a716-446655440000",
  "rewardPoints": 100,
  ...
}
```

#### 2.2 Approve Token (Frontend/Script)
```javascript
// Frontend với wagmi hoặc script
const tokenContract = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, signer);
const tx1 = await tokenContract.approve(CONTRACT_ADDRESS, ethers.parseEther("100"));
await tx1.wait();
console.log("Approved!");
```

#### 2.3 Deposit vào Escrow (Frontend/Script)
```javascript
const escrowContract = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);
const tx2 = await escrowContract.deposit(
  ethers.parseEther("100"),
  "0xFreelancerAddress",
  Math.floor(Date.now() / 1000) + 86400, // deadline 1 ngày
  "550e8400-e29b-41d4-a716-446655440000" // externalTaskId từ response trên
);
await tx2.wait();
console.log("Deposited! TaskId =", await escrowContract.taskCount());
```

#### 2.4 Kiểm tra Backend đã sync chưa
```bash
GET http://localhost:3000/escrow/task/1

# Response:
{
  "taskId": "1",
  "externalTaskId": "550e8400-...",
  "employer": "0xEmployer...",
  "freelancer": "0xFreelancer...",
  "amount": "100000000000000000000",
  "settled": false,
  "depositedTx": "0xabc..."
}
```

#### 2.5 Freelancer submit work (Off-chain API)
```bash
POST http://localhost:3000/applications/:id/submit
Authorization: Bearer <FREELANCER_JWT>

{
  "outcome": "https://github.com/project",
  "outcomeType": "text"
}
```

#### 2.6 Admin Release Token (Backend API)
```bash
POST http://localhost:3000/escrow/release
Authorization: Bearer <ADMIN_JWT>
Content-Type: application/json

{
  "taskId": 1,
  "to": "0xFreelancerAddress",
  "reason": "Task completed successfully"
}

# Response:
{
  "success": true,
  "txHash": "0xdef...",
  "taskId": "1"
}
```

#### 2.7 Verify token đã chuyển
```bash
GET http://localhost:3000/escrow/task/1

# Response:
{
  "settled": true,
  "releasedTx": "0xdef...",
  "releaseTo": "0xFreelancer...",
  "releaseReason": "Task completed successfully"
}
```

```javascript
// Hoặc check balance on-chain
const balance = await tokenContract.balanceOf("0xFreelancerAddress");
console.log("Freelancer balance:", ethers.formatEther(balance)); // 100
```

---

## 🔄 Test với Testnet (Sepolia/Mumbai)

### 1. Deploy contract lên testnet
```bash
npx hardhat run scripts/deploy.js --network sepolia
```

### 2. Lấy test token
- Sepolia ETH faucet: https://sepoliafaucet.com
- Deploy MockERC20 hoặc dùng token test có sẵn

### 3. Cập nhật `.env`
```env
RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
CONTRACT_ADDRESS=<deployed_address>
TOKEN_ADDRESS=<token_address>
ADMIN_PRIVATE_KEY=<your_testnet_key>
CHAIN_ID=11155111
```

### 4. Chạy lại flow như trên

---

## 🐛 Troubleshooting

### Event listener không bắt được event
```bash
# Check logs
tail -f logs/blockchain.log

# Hoặc chạy reconciliation script
pnpm run reconcile:escrow
```

### Contract revert "External ID exists"
→ ExternalTaskId đã được dùng rồi, tạo task mới với UUID khác

### Release failed "not admin"
→ Check ADMIN_PRIVATE_KEY có đúng role ADMIN_ROLE không:
```javascript
const hasRole = await contract.hasRole(ADMIN_ROLE, adminAddress);
console.log("Has admin role:", hasRole);
```

---

## 📊 Monitoring

### Check event logs real-time
```bash
# Terminal 1: Backend server
pnpm run dev

# Terminal 2: Watch blockchain logs
tail -f logs/blockchain.log | grep "Deposited\|Released"
```

### Query DB để check sync status
```sql
-- Tất cả escrow tasks
SELECT * FROM escrow_tasks ORDER BY created_at DESC;

-- Tasks chưa settled
SELECT * FROM escrow_tasks WHERE settled = false;

-- Compare với on-chain
SELECT COUNT(*) FROM escrow_tasks; -- should match contract.taskCount()
```

---

## 🎯 Integration Test Script (Tự động)

```javascript
// test/integration/escrow.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const axios = require("axios");

describe("Escrow Integration", function() {
  let employer, freelancer, admin;
  let token, escrow;
  const API_BASE = "http://localhost:3000";

  before(async () => {
    [admin, employer, freelancer] = await ethers.getSigners();
    // Deploy contracts...
    // Start backend server...
  });

  it("Full flow: create task → deposit → submit → release", async () => {
    // 1. Create task via API
    const taskRes = await axios.post(`${API_BASE}/tasks`, {
      title: "Test task",
      rewardPoints: 100,
      // ...
    });
    const externalTaskId = taskRes.data.externalTaskId;

    // 2. Approve + deposit
    await token.connect(employer).approve(escrow.address, ethers.parseEther("100"));
    const tx = await escrow.connect(employer).deposit(
      ethers.parseEther("100"),
      freelancer.address,
      Math.floor(Date.now()/1000) + 86400,
      externalTaskId
    );
    await tx.wait();

    // 3. Wait for backend to sync
    await new Promise(r => setTimeout(r, 2000));

    // 4. Check API
    const escrowRes = await axios.get(`${API_BASE}/escrow/task/1`);
    expect(escrowRes.data.settled).to.be.false;

    // 5. Release via API
    await axios.post(`${API_BASE}/escrow/release`, {
      taskId: 1,
      to: freelancer.address,
      reason: "Done"
    });

    // 6. Verify
    const finalRes = await axios.get(`${API_BASE}/escrow/task/1`);
    expect(finalRes.data.settled).to.be.true;

    const balance = await token.balanceOf(freelancer.address);
    expect(balance).to.equal(ethers.parseEther("100"));
  });
});
```

Chạy test:
```bash
npx hardhat test test/integration/escrow.test.js
```

---

## 🎬 Video Demo Flow
1. Khởi động Hardhat node
2. Deploy contract
3. Start backend (event listeners running)
4. Create task qua Postman
5. Deposit qua Hardhat console/script
6. Check DB đã có record
7. Release qua API
8. Verify token balance thay đổi

---

## 📞 Support
Nếu gặp lỗi, check:
- Backend logs: `logs/app.log`, `logs/blockchain.log`
- Contract events: `npx hardhat console` → `await contract.queryFilter(contract.filters.Deposited())`
- DB state: `psql` hoặc Supabase dashboard
