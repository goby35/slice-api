// src/scripts/reconcileEscrow.ts
// Script để sync tất cả past events từ blockchain vào DB
// Chạy: npx tsx src/scripts/reconcileEscrow.ts

import { ethers } from "ethers";
import { db } from "../db/index.js";
import { escrowTasks } from "../db/schema.js";
import dotenv from "dotenv";

dotenv.config();

const ESCROW_ABI = [
  "event Deposited(uint256 indexed taskId, string indexed externalId, address employer, uint256 amount)",
  "event Released(uint256 indexed taskId, address to, uint256 amount, string reason)",
  "function escrows(uint256 taskId) view returns (address employer, address freelancer, uint256 amount, uint256 deadline, bool settled)",
  "function taskCount() view returns (uint256)"
];

async function reconcileEscrow() {
  const rpcUrl = process.env.RPC_URL;
  const contractAddress = process.env.ESCROW_CONTRACT_ADDRESS;

  if (!rpcUrl || !contractAddress) {
    console.error("❌ RPC_URL or ESCROW_CONTRACT_ADDRESS not set");
    process.exit(1);
  }

  console.log("🔄 Starting reconciliation...");
  console.log("   Contract:", contractAddress);
  console.log("   RPC:", rpcUrl);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider);

  // Get taskCount
  const taskCount = await contract.taskCount();
  console.log(`📊 Total tasks on-chain: ${taskCount}`);

  if (taskCount === 0n) {
    console.log("✅ No tasks to reconcile");
    return;
  }

  // Get deployment block (or use env var ESCROW_START_BLOCK)
  const startBlock = Number(process.env.ESCROW_START_BLOCK || 0);
  const currentBlock = await provider.getBlockNumber();
  console.log(`🔍 Scanning from block ${startBlock} to ${currentBlock}...`);

  // Query all Deposited events
  const depositedFilter = contract.filters.Deposited();
  const depositedEvents = await contract.queryFilter(
    depositedFilter,
    startBlock,
    currentBlock
  );

  console.log(`📥 Found ${depositedEvents.length} Deposited events`);

  for (const event of depositedEvents) {
    try {
      // Type guard to ensure event has args property
      if (!('args' in event)) {
        console.warn('⚠️  Skipping event without args:', event);
        continue;
      }
      const taskId = event.args![0].toString();
      const externalId = event.args![1];
      const employer = event.args![2];
      const amount = event.args![3].toString();

      // Fetch full escrow data
      const escrowData = await contract.escrows(BigInt(taskId));

      // Insert or update DB
      await db
        .insert(escrowTasks)
        .values({
          taskId,
          externalTaskId: externalId,
          employer: escrowData.employer.toLowerCase(),
          freelancer: escrowData.freelancer.toLowerCase(),
          amount: escrowData.amount.toString(),
          deadline: Number(escrowData.deadline),
          settled: escrowData.settled ? 1 : 0,
          depositedTx: event.transactionHash,
          depositedAt: new Date()
        })
        .onConflictDoUpdate({
          target: escrowTasks.taskId,
          set: {
            amount: escrowData.amount.toString(),
            deadline: Number(escrowData.deadline),
            settled: escrowData.settled ? 1 : 0
          }
        });

      console.log(`✅ Synced task ${taskId} (${externalId})`);
    } catch (error) {
      console.error(`❌ Error syncing task:`, error);
    }
  }

  // Query all Released events
  const releasedFilter = contract.filters.Released();
  const releasedEvents = await contract.queryFilter(
    releasedFilter,
    startBlock,
    currentBlock
  );

  console.log(`📤 Found ${releasedEvents.length} Released events`);

  for (const event of releasedEvents) {
    try {
      // Type guard to ensure event has args property
      if (!('args' in event)) {
        console.warn('⚠️  Skipping event without args:', event);
        continue;
      }
      const taskId = event.args![0].toString();
      const to = event.args![1];
      const reason = event.args![3];

      // Update DB
      await db
        .update(escrowTasks)
        .set({
          settled: 1,
          releasedTx: event.transactionHash,
          releasedAt: new Date(),
          releaseTo: to.toLowerCase(),
          releaseReason: reason
        })
        .where(eq(escrowTasks.taskId, taskId));

      console.log(`✅ Synced release for task ${taskId}`);
    } catch (error) {
      console.error(`❌ Error syncing release:`, error);
    }
  }

  console.log("🎉 Reconciliation complete!");
  process.exit(0);
}

// Import eq từ drizzle
import { eq } from "drizzle-orm";

reconcileEscrow().catch((error) => {
  console.error("❌ Reconciliation failed:", error);
  process.exit(1);
});
