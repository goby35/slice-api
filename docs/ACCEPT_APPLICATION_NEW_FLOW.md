# ⚠️ LUỒNG MỚI: Accept Application với On-Chain Verification

## Thay đổi quan trọng

### ❌ Cũ (SAI):
- Frontend bấm "Accept" → gọi `PUT /applications/:id` với status=accepted
- Backend tự động chấp nhận mà không kiểm tra ký quỹ on-chain

### ✅ Mới (ĐÚNG):
1. Frontend bấm "Accept" → MỞ modal deposit
2. User ký quỹ on-chain: `contract.deposit(amount, freelancer, deadline, taskId)`
3. Deposit thành công → Frontend gọi `POST /applications/:id/accept`
4. Backend verify on-chain → Nếu OK mới accept

---

## Backend Changes

### 1. Database Migration

```sql
-- migrations/003_add_deposit_tracking.sql
ALTER TABLE slice_db.tasks
ADD COLUMN IF NOT EXISTS deposited_tx_hash VARCHAR(66),
ADD COLUMN IF NOT EXISTS on_chain_task_id VARCHAR(100);
```

**Chạy migration:**
```bash
psql $DATABASE_URL -f migrations/003_add_deposit_tracking.sql
```

### 2. Schema Update

File: `src/db/schema.ts`
```typescript
export const tasks = sliceDB.table("tasks", {
  // ... existing fields
  depositedTxHash: varchar("deposited_tx_hash", { length: 66 }),
  onChainTaskId: varchar("on_chain_task_id", { length: 100 }),
  // ...
});
```

### 3. New Helper Function

File: `src/services/blockchainService.ts`
```typescript
export async function verifyEscrowDeposit(
  externalTaskId: string,
  expectedFreelancerAddress: string
): Promise<
  | { valid: true; onChainTaskId: string; escrow: any }
  | { valid: false; reason: string }
>
```

**Logic:**
- Gọi `contract.externalToInternal(externalTaskId)`
- Nếu trả về 0 → chưa có deposit
- Gọi `contract.escrows(onChainTaskId)`
- Check: `escrow.freelancer === expectedFreelancer` (lowercase)
- Check: `!escrow.settled`
- Trả về validation result

### 4. New Endpoint

File: `src/routes/taskApplications.ts`

```typescript
POST /applications/:id/accept
```

**Handler logic:**
1. Auth: verify user là employer của task
2. Get application + task
3. **CRITICAL:** Call `verifyEscrowDeposit(task.externalTaskId, freelancer.walletAddress)`
4. If not valid → return 400 với error message
5. If valid → update DB:
   ```typescript
   await db.update(taskApplications)
     .set({ status: "accepted" })
     .where(eq(taskApplications.id, id));
   
   await db.update(tasks)
     .set({
       freelancerProfileId: freelancer.profileId,
       status: "in_progress",
       onChainTaskId: verification.onChainTaskId,
       depositedTxHash: verification.escrow.externalTaskId
     })
     .where(eq(tasks.id, taskId));
   ```
6. Reject other applications
7. Send notifications

**Response:**
```json
{
  "message": "Application accepted successfully",
  "application": { ... },
  "onChainTaskId": "1"
}
```

**Error responses:**
```json
// Chưa deposit
{
  "error": "Chưa có đơn ký quỹ on-chain cho task này. Vui lòng hoàn tất deposit trước.",
  "code": "DEPOSIT_NOT_VERIFIED"
}

// Sai freelancer
{
  "error": "Đơn ký quỹ tồn tại nhưng dành cho freelancer khác (0x...). Vui lòng deposit lại với địa chỉ đúng.",
  "code": "DEPOSIT_NOT_VERIFIED"
}

// Already settled
{
  "error": "Đơn ký quỹ đã được giải ngân. Không thể chấp nhận application.",
  "code": "DEPOSIT_NOT_VERIFIED"
}
```

---

## Testing

### Test Case 1: Accept without deposit (should fail)
```bash
# Không có deposit on-chain
curl -X POST http://localhost:3000/applications/app-uuid/accept \
  -H "Authorization: Bearer $JWT"

# Expected: 400 Bad Request
# { "error": "Chưa có đơn ký quỹ on-chain...", "code": "DEPOSIT_NOT_VERIFIED" }
```

### Test Case 2: Accept with valid deposit (should succeed)
```bash
# 1. Frontend deposit on-chain first
# contract.deposit(amount, freelancer, deadline, taskId)

# 2. Then call API
curl -X POST http://localhost:3000/applications/app-uuid/accept \
  -H "Authorization: Bearer $JWT"

# Expected: 200 OK
# { "message": "Application accepted successfully", ... }
```

### Test Case 3: Accept with wrong freelancer (should fail)
```bash
# Deposit with freelancerA but application for freelancerB
# Expected: 400 Bad Request
# { "error": "Đơn ký quỹ tồn tại nhưng dành cho freelancer khác..." }
```

---

## Important Notes

### Wallet Address Requirement
Backend cần lấy wallet address của freelancer để verify. Có 2 options:

**Option 1: Giả định users.profileId là wallet address**
```typescript
const [freelancerUser] = await db
  .select()
  .from(users)
  .where(eq(users.profileId, application.applicantProfileId));

const freelancerWallet = freelancerUser.profileId; // Nếu profileId = wallet
```

**Option 2: Thêm cột walletAddress vào users**
```sql
ALTER TABLE slice_db.users
ADD COLUMN wallet_address VARCHAR(42) UNIQUE;
```

### Event Listener Changes
File: `src/services/blockchainService.ts`

Deposited listener **KHÔNG** auto-accept nữa, chỉ sync data:
```typescript
contract.on("Deposited", async (taskId, externalId, employer, amount, event) => {
  // ONLY: Insert/update escrow_tasks table
  await db.insert(escrowTasks).values({ ... });
  
  // KHÔNG gọi update task.status = "in_progress"
  // KHÔNG gọi update application.status = "accepted"
});
```

---

## Deployment Checklist

- [ ] Chạy migration `003_add_deposit_tracking.sql`
- [ ] Update schema.ts (depositedTxHash, onChainTaskId)
- [ ] Add `verifyEscrowDeposit()` function
- [ ] Add endpoint `POST /applications/:id/accept`
- [ ] Verify Deposited listener không auto-accept
- [ ] Test 3 cases (no deposit, valid deposit, wrong freelancer)
- [ ] Update frontend integration docs
- [ ] Deploy backend
- [ ] Update frontend to use new flow

---

## Rollback Plan

Nếu có vấn đề, có thể rollback bằng cách:
1. Comment endpoint mới `POST /applications/:id/accept`
2. Giữ lại endpoint cũ `PUT /applications/:id` với status=accepted (không verify)
3. Frontend revert về gọi PUT endpoint

Nhưng **KHÔNG khuyến nghị** vì mất tính bảo mật.

---

**File:** `docs/ACCEPT_APPLICATION_NEW_FLOW.md`  
**Date:** 2025-11-17  
**Status:** ✅ Ready for implementation
