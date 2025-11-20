// scripts/deadline-automation.mjs
/**
 * Cron job để xử lý deadline automation
 * Chạy mỗi giờ hoặc định kỳ để check tasks quá deadline
 * Sử dụng releaseAfterDeadline() - permissionless, không cần admin key
 * 
 * Run: node scripts/deadline-automation.mjs
 * Hoặc thêm vào crontab/task scheduler
 */

import { ethers } from 'ethers';
import { db } from '../src/db/index.js';
import { escrowTasks, tasks, taskApplications } from '../src/db/schema.js';
import { eq, and, lt } from 'drizzle-orm';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.RPC_URL;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;

const ESCROW_ABI = [
  'function releaseAfterDeadline(uint256 taskId, address to, string reason)',
  'function escrows(uint256) view returns (address employer, address freelancer, uint256 amount, uint256 deadline, bool settled, string externalId)',
];

let processing = false;

async function processDeadlineExpired() {
  if (processing) {
    console.log('⏳ Already processing, skipping this run');
    return;
  }

  processing = true;
  console.log('🚀 Starting deadline automation check:', new Date().toISOString());

  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const signer = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, signer);

    const now = Math.floor(Date.now() / 1000);

    // Lấy tất cả escrow tasks chưa settled và đã quá deadline
    const expiredTasks = await db
      .select()
      .from(escrowTasks)
      .where(
        and(
          eq(escrowTasks.settled, false),
          lt(escrowTasks.deadline, now)
        )
      );

    console.log(`📋 Found ${expiredTasks.length} expired tasks to process`);

    for (const escrowTask of expiredTasks) {
      try {
        console.log(`\n⏰ Processing task ${escrowTask.taskId} (external: ${escrowTask.externalTaskId})`);

        // Lấy thông tin task và application từ DB
        const [task] = await db
          .select()
          .from(tasks)
          .where(eq(tasks.externalTaskId, escrowTask.externalTaskId));

        if (!task) {
          console.log(`⚠️  Task not found in DB: ${escrowTask.externalTaskId}`);
          continue;
        }

        // Lấy application của task này
        const [application] = await db
          .select()
          .from(taskApplications)
          .where(eq(taskApplications.taskId, task.id));

        if (!application) {
          console.log(`⚠️  No application found for task ${task.id}`);
          // Default: hoàn tiền cho employer (chưa có ai apply)
          await releaseToEmployer(contract, escrowTask, 'No application submitted');
          continue;
        }

        // === LOGIC PHÂN LUỒNG ===

        // Case 1: Đã complete → skip (đã được xử lý rồi)
        if (task.status === 'completed' || application.status === 'completed') {
          console.log('✅ Task already completed, skipping');
          continue;
        }

        // Case 2: Task đã bị cancel → hoàn employer
        if (task.status === 'cancelled' || application.status === 'rejected') {
          console.log('❌ Task cancelled, refunding employer');
          await releaseToEmployer(contract, escrowTask, 'Task cancelled');
          continue;
        }

        // Case 3: Freelancer đã submit và đang chờ review (in_review) → trả freelancer
        if (application.status === 'in_review') {
          console.log('📝 Work submitted and in review, releasing to freelancer');
          await releaseToFreelancer(contract, escrowTask, 'Deadline passed, work was submitted');
          
          // Update DB: mark task as completed
          await db
            .update(tasks)
            .set({ status: 'completed' })
            .where(eq(tasks.id, task.id));
          
          await db
            .update(taskApplications)
            .set({ status: 'completed', completedAt: new Date() })
            .where(eq(taskApplications.id, application.id));
          
          continue;
        }

        // Case 4: Freelancer chưa submit hoặc đang cần revision → hoàn employer
        if (
          application.status === 'accepted' || // accepted nhưng chưa submit
          application.status === 'submitted' || // vừa apply chưa làm gì
          application.status === 'needs_revision' || // cần sửa nhưng không sửa
          application.status === 'in_progress' // legacy status
        ) {
          console.log(`🔄 Work not submitted (status: ${application.status}), refunding employer`);
          await releaseToEmployer(contract, escrowTask, 'Deadline passed, no submission');
          
          // Update DB: mark task as cancelled
          await db
            .update(tasks)
            .set({ status: 'cancelled' })
            .where(eq(tasks.id, task.id));
          
          await db
            .update(taskApplications)
            .set({ status: 'rejected' })
            .where(eq(taskApplications.id, application.id));
          
          continue;
        }

        console.log(`⚠️  Unknown status: ${application.status}, skipping`);

      } catch (error) {
        console.error(`❌ Error processing task ${escrowTask.taskId}:`, error.message);
        // Continue với tasks khác
      }
    }

    console.log('\n✅ Deadline automation completed');
  } catch (error) {
    console.error('❌ Fatal error in deadline automation:', error);
  } finally {
    processing = false;
  }
}

async function releaseToFreelancer(contract, escrowTask, reason) {
  try {
    console.log(`  → Releasing to freelancer: ${escrowTask.freelancer}`);
    const tx = await contract.releaseAfterDeadline(
      escrowTask.taskId,
      escrowTask.freelancer,
      reason
    );
    console.log(`  → Tx sent: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✅ Released to freelancer`);
  } catch (error) {
    console.error(`  ❌ Failed to release to freelancer:`, error.message);
    throw error;
  }
}

async function releaseToEmployer(contract, escrowTask, reason) {
  try {
    console.log(`  → Refunding to employer: ${escrowTask.employer}`);
    const tx = await contract.releaseAfterDeadline(
      escrowTask.taskId,
      escrowTask.employer,
      reason
    );
    console.log(`  → Tx sent: ${tx.hash}`);
    await tx.wait();
    console.log(`  ✅ Refunded to employer`);
  } catch (error) {
    console.error(`  ❌ Failed to refund to employer:`, error.message);
    throw error;
  }
}

// Run immediately if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  processDeadlineExpired()
    .then(() => {
      console.log('\n🎉 Script completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Script failed:', error);
      process.exit(1);
    });
}

export { processDeadlineExpired };
