# Frontend — Contract Bridge (Tóm tắt & Hướng dẫn kết nối)

Mục tiêu: cung cấp cho frontend dev mọi thứ cần biết để tương tác an toàn với `TaskEscrowPool` contract và backend.

**Tóm tắt nhanh**
- Contract chính: `TaskEscrowPool` (ERC20 token escrow)
- Token: ERC20 (mock token on local tests)
- 3 function quan trọng:
  - `deposit(uint256 amount, address freelancer, uint256 deadline, string externalTaskId)` — employer gọi (phải approve token trước)
  - `cancel(uint256 taskId, string reason)` — employer/admin gọi **trước deadline** để refund
  - `releaseAfterDeadline(uint256 taskId, address to, string reason)` — anyone gọi **sau deadline** để release (permissionless)
- 3 events: `Deposited`, `Released`, `Cancelled` — frontend có thể lắng nghe cho UX updates
- Mapping on-chain ↔ off-chain: contract lưu `externalTaskId` (string) → có thể gọi `externalToInternal(externalId)` để lấy `taskId`. Backend lưu `escrow_tasks` liên kết `taskId` ↔ `externalTaskId`.

**File tham chiếu backend**
- Backend endpoint hữu ích: `GET /escrow/task/:taskId` — trả dữ liệu đã đồng bộ từ DB (thay vì parse logs client-side) — khuyến nghị frontend dùng endpoint này để hiện UI.
- Khi thực hiện thao tác on-chain (deposit/cancel/release...), frontend nên gọi trực tiếp contract bằng ví người dùng (Metamask), sau đó backend sẽ nhận event và cập nhật DB.

---

**Trường dữ liệu chính (on-chain / DB mapping)**
- on-chain `escrows(taskId)` trả: `employer`, `freelancer`, `amount`, `deadline`, `settled`, `externalTaskId`
- DB `escrow_tasks` fields: `taskId`, `externalTaskId`, `employer`, `freelancer`, `amount`, `deadline`, `settled`, `depositedTx`, `releasedTx`, `releaseTo`, `releaseReason`, `depositedAt`, `releasedAt`

---

**UX flows & ví dụ code (ethers.js v6)**

1) Kết nối ví (Metamask)
```javascript
import { ethers } from 'ethers';

// Browser: Metamask
async function connectWallet() {
  if (!window.ethereum) throw new Error('Please install MetaMask');
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  return { provider, signer };
}
```

2) Deposit (Employer): approve token → deposit
```javascript
const CONTRACT_ADDRESS = '0x...';
const TOKEN_ADDRESS = '0x...';
const ESCROW_ABI = [ /* minimal ABI: deposit, events, externalToInternal, escrows */ ];
const TOKEN_ABI = [ 'function approve(address,uint256) returns (bool)' ];

async function depositFlow({ signer, freelancerAddress, amountWei, deadlineUnix, externalTaskId }) {
  const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
  // 1) approve
  const approveTx = await token.approve(CONTRACT_ADDRESS, amountWei);
  await approveTx.wait();

  // 2) deposit
  const escrow = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);
  const tx = await escrow.deposit(amountWei, freelancerAddress, deadlineUnix, externalTaskId);
  await tx.wait();

  // 3) Get taskId: either parse event from receipt or call externalToInternal
  // a) parse event from tx receipt
  // b) or: const taskId = await escrow.externalToInternal(externalTaskId);
}
```
Notes:
- `amountWei` là số token theo decimals (use ethers.parseUnits / parseEther as appropriate).
- `deadlineUnix` là UNIX timestamp (seconds).

3) Cancel (Employer, before deadline)
```javascript
async function cancel(taskId, signer, reason = 'Cancelled by employer') {
  const escrow = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);
  const tx = await escrow.cancel(BigInt(taskId), reason);
  await tx.wait();
  // Backend will receive Cancelled event and update DB
}
```

4) Release after deadline (anyone can trigger)
```javascript
async function releaseAfterDeadline(taskId, toAddress, signer, reason = 'Release after deadline') {
  const escrow = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);
  const tx = await escrow.releaseAfterDeadline(BigInt(taskId), toAddress, reason);
  await tx.wait();
}
```

5) Read escrow info (on-chain)
```javascript
async function readEscrow(taskId, provider) {
  const escrow = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, provider);
  const info = await escrow.escrows(BigInt(taskId));
  return {
    employer: info[0],
    freelancer: info[1],
    amount: info[2].toString(),
    deadline: Number(info[3]),
    settled: Boolean(info[4]),
    externalTaskId: info[5]
  };
}
```
But recommended: call backend `GET /escrow/task/:taskId` to obtain DB-enriched data (timestamps, tx hashes, human-friendly fields).

6) Listening to events (optional real-time UI)
```javascript
// Using signer/provider with WebSocket or browser provider (if supported)
const escrow = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, provider);

escrow.on('Deposited', (taskId, externalId, employer, amount, event) => {
  // Update UI or refetch backend
  console.log('Deposited', taskId.toString(), externalId, employer, amount.toString());
});

escrow.on('Released', (taskId, to, amount, reason, event) => {
  console.log('Released', taskId.toString(), to, amount.toString(), reason);
});

escrow.on('Cancelled', (taskId, employer, amount, reason, event) => {
  console.log('Cancelled', taskId.toString(), employer, amount.toString(), reason);
});
```
Note: Browser provider may not support websocket filters; prefer backend event-sync for reliable UI.

---

**Where to get `taskId` after deposit?**
- Preferred: Backend listens to `Deposited` event and inserts into `escrow_tasks` with mapped `taskId` ↔ `externalTaskId`. Frontend then calls backend (e.g., `GET /tasks/:id` or `GET /escrow/task/:taskId`) to get updated info.
- Alternative: Parse the transaction receipt events client-side to extract `taskId` (less robust).
- Or call on-chain: `const id = await escrow.externalToInternal(externalTaskId);` then `escrow.escrows(id)`.

---

**Security & UX recommendations**
- Always require users to use their wallet (Metamask) for on-chain actions (approve, deposit, cancel).
- For admin-only operations (if any), use backend server with admin key — frontend should not hold admin private keys.
- Use backend endpoints as source-of-truth for rendered data (DB will be synced by event listeners). This avoids relying solely on client-side log parsing.
- Show transaction pending state and wait for confirmation before updating UI.
- For `releaseAfterDeadline`, anybody can call it; the frontend may provide a "Claim / Finalize" button for employer/freelancer to trigger the on-chain call.
- Always verify on-chain state after tx: call `escrows(taskId)` or ask backend for updated record.

---

**Env / Configuration that frontend needs**
- `REACT_APP_CONTRACT_ADDRESS` (or similar)
- `REACT_APP_TOKEN_ADDRESS`
- RPC endpoint only if frontend needs to read chain without user wallet (optional)

---

**Quick Integration Checklist for Frontend dev**
- [ ] Add contract addresses to environment config
- [ ] Add minimal ABIs for functions/events used
- [ ] Implement wallet connect (Metamask / WalletConnect)
- [ ] Implement deposit flow: approve → deposit (show tx hash + wait for confirmation)
- [ ] After deposit: call backend to refresh task/escrow data (or parse event)
- [ ] Implement Cancel button (employer-only) calling `cancel()`
- [ ] Implement Claim/Finalize (releaseAfterDeadline) button when deadline passed
- [ ] Subscribe to backend WebSocket/Server-Sent Events or poll `GET /escrow/task/:taskId` for updates

---

**Extra: Minimal ABI snippets (paste into frontend)**
```javascript
const ESCROW_ABI = [
  'function deposit(uint256 amount, address freelancer, uint256 deadline, string externalTaskId)',
  'function cancel(uint256 taskId, string reason)',
  'function releaseAfterDeadline(uint256 taskId, address to, string reason)',
  'function externalToInternal(string externalId) view returns (uint256)',
  'function escrows(uint256) view returns (address,address,uint256,uint256,bool,string)',
  'event Deposited(uint256 indexed taskId, string indexed externalId, address employer, uint256 amount)',
  'event Released(uint256 indexed taskId, address to, uint256 amount, string reason)',
  'event Cancelled(uint256 indexed taskId, address employer, uint256 amount, string reason)'
];

const TOKEN_ABI = [ 'function approve(address spender, uint256 amount) returns (bool)', 'function balanceOf(address) view returns (uint256)' ];
```

---

**Where frontend should call backend vs on-chain**
- On-chain (via user wallet): `deposit`, `cancel`, `releaseAfterDeadline` (user-initiated txs)
- Backend: `GET /escrow/task/:taskId` (display), indexing/history, notifications, reconcile missing events, admin functions that require server signer

---

## ⚠️ LUỒNG MỚI: Accept Application Flow (CRITICAL)

**Quy tắc bắt buộc:**
1. Frontend KHÔNG gọi API accept application ngay khi employer bấm "Accept"
2. Frontend MỞ modal deposit → user ký quỹ on-chain TRƯỚC
3. CHỈ KHI deposit() thành công → frontend gọi API backend

### Bước 1: Employer bấm "Accept Application"

```typescript
// Component: ApplicationCard.tsx
async function handleAcceptApplication(applicationId: string, freelancerAddress: string) {
  // Open deposit modal (DO NOT call API yet)
  setDepositModalOpen(true);
  setSelectedApplication({
    id: applicationId,
    freelancerAddress,
    taskId: task.externalTaskId, // UUID từ task
    defaultAmount: task.rewardPoints // Hoặc convert sang token amount
  });
}
```

### Bước 2: Modal Deposit (Component mẫu)

```typescript
// EscrowDepositModal.tsx
interface DepositModalProps {
  taskId: string; // externalTaskId (UUID)
  freelancerAddress: string; // Địa chỉ ví freelancer
  defaultAmount: string;
  applicationId: string; // Để gọi API sau khi deposit
  onSuccess: () => void;
  onClose: () => void;
}

async function depositAndAccept({
  taskId,
  freelancerAddress,
  amount,
  deadline,
  applicationId
}: DepositParams) {
  try {
    setLoading(true);
    setStep('approving');

    // 1. Approve token
    const token = new ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);
    const approveTx = await token.approve(CONTRACT_ADDRESS, amount);
    await approveTx.wait();

    setStep('depositing');

    // 2. Deposit escrow (externalTaskId = taskId)
    const escrow = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);
    const depositTx = await escrow.deposit(
      amount,
      freelancerAddress, // MUST match application's freelancer
      deadline,
      taskId // externalTaskId = task UUID
    );
    const receipt = await depositTx.wait();

    setStep('accepting');

    // 3. ONLY NOW: Call backend to accept application
    const response = await fetch(`/api/applications/${applicationId}/accept`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to accept application');
    }

    setStep('done');
    onSuccess();
  } catch (error) {
    console.error('Deposit flow failed:', error);
    setError(error.message);
  } finally {
    setLoading(false);
  }
}
```

### Bước 3: Backend Endpoint (NEW)

```http
POST /applications/:applicationId/accept
Authorization: Bearer <JWT>
```

**Backend sẽ kiểm tra:**
1. Application thuộc task của employer
2. Application status = "submitted"
3. **CRITICAL:** Gọi contract `externalToInternal(taskId)` → lấy on-chain taskId
4. Nếu on-chain taskId = 0 → trả lỗi "Chưa có ký quỹ"
5. Gọi `escrows(onChainTaskId)` → verify:
   - `escrow.freelancer === freelancerAddress` (lowercase compare)
   - `!escrow.settled`
6. Nếu pass → mới update DB:
   - `application.status = 'accepted'`
   - `task.status = 'in_progress'`
   - `task.freelancerProfileId = freelancerAddress`
   - `task.onChainTaskId = onChainTaskId`
   - Reject các applications khác

**Response Success:**
```json
{
  "message": "Application accepted successfully",
  "application": { ... },
  "onChainTaskId": "1"
}
```

**Response Error (chưa deposit):**
```json
{
  "error": "Chưa có đơn ký quỹ on-chain cho task này. Vui lòng hoàn tất deposit trước.",
  "code": "DEPOSIT_NOT_VERIFIED"
}
```

**Response Error (sai freelancer):**
```json
{
  "error": "Đơn ký quỹ tồn tại nhưng dành cho freelancer khác (0x...). Vui lòng deposit lại với địa chỉ đúng.",
  "code": "DEPOSIT_NOT_VERIFIED"
}
```

### Xử lý lỗi Frontend

```typescript
// If deposit success but backend verify fails
if (error.code === 'DEPOSIT_NOT_VERIFIED') {
  alert('Lỗi xác thực ký quỹ. Vui lòng kiểm tra lại địa chỉ freelancer và thử lại.');
  // User có thể deposit lại hoặc hủy
}
```

---

## Security Notes

- **Freelancer address:** Frontend phải lấy địa chỉ ví từ user profile (users.profileId nếu là wallet address) hoặc từ bảng riêng lưu wallet.
- Nếu users table không lưu wallet address, cần thêm cột `walletAddress` vào users table hoặc tạo bảng `user_wallets`.
- Backend KHÔNG TIN frontend input, luôn verify on-chain trước khi accept.

---

If bạn muốn, tôi sẽ:
- Thêm một component React đầy đủ (TSX) với UI + ethers.js logic.
- Hoặc làm một gói React hooks (`useEscrow`, `useWallet`) để tích hợp nhanh.
- Thêm migration để add `walletAddress` vào users table.

File đã tạo: `docs/FRONTEND_CONTRACT_BRIDGE.md`
