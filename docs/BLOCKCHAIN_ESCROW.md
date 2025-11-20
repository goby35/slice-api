# Blockchain Escrow Integration

## Cài đặt dependencies

```bash
pnpm add ethers@^6
# or
npm install ethers@^6
```

## Environment variables cần thiết

Thêm vào `.env`:
```
RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
ESCROW_CONTRACT_ADDRESS=0x...
ADMIN_PRIVATE_KEY=0x...
TOKEN_ADDRESS=0x...
```

## Chạy migration

```bash
psql "<DATABASE_URL>" -f migrations/003_add_escrow_blockchain.sql
```

hoặc dùng drizzle-kit:
```bash
npx drizzle-kit push
```

## Khởi động event listeners

Event listeners sẽ tự động start khi server khởi động (xem `src/index.ts`).

## API Endpoints

### GET /escrow/task/:taskId
Lấy thông tin escrow task từ blockchain taskId

### GET /escrow/external/:externalTaskId  
Lấy thông tin escrow task từ UUID (externalTaskId)

### POST /escrow/release
Admin release funds (requires ADMIN_ROLE)
Body:
```json
{
  "taskId": "1",
  "to": "0x...",
  "reason": "Task completed successfully"
}
```

### GET /escrow/sync/:taskId
Force sync một task từ blockchain

## Reconciliation

Chạy script để sync tất cả past events:
```bash
npx tsx src/scripts/reconcileEscrow.ts
```
