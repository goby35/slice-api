// scripts/test-cancel.mjs
/**
 * Test cancel function (before deadline)
 * Run: node scripts/test-cancel.mjs <taskId>
 * Example: node scripts/test-cancel.mjs 1
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function testCancel() {
  try {
    const taskId = process.argv[2];
    
    if (!taskId) {
      console.error('❌ Please provide taskId');
      console.error('Usage: node scripts/test-cancel.mjs <taskId>');
      process.exit(1);
    }
    
    console.log('🚫 Testing Cancel Before Deadline\n');
    console.log('━'.repeat(50));
    
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const employer = new ethers.Wallet(process.env.EMPLOYER_PRIVATE_KEY, provider);
    
    const escrowABI = [
      'function escrows(uint256) view returns (address employer, address freelancer, uint256 amount, uint256 deadline, bool settled, string externalTaskId)',
      'function cancel(uint256 taskId, string reason)',
      'event Cancelled(uint256 indexed taskId, address employer, uint256 amount, string reason)'
    ];
    
    const escrow = new ethers.Contract(process.env.CONTRACT_ADDRESS, escrowABI, employer);
    
    // Check escrow info first
    console.log('📋 Escrow Information:');
    const escrowInfo = await escrow.escrows(taskId);
    console.log('   Employer:', escrowInfo[0]);
    console.log('   Freelancer:', escrowInfo[1]);
    console.log('   Amount:', ethers.formatEther(escrowInfo[2]), 'tokens');
    console.log('   Deadline:', new Date(Number(escrowInfo[3]) * 1000).toISOString());
    console.log('   Settled:', escrowInfo[4] ? 'Yes ❌' : 'No ✅');
    console.log('   External ID:', escrowInfo[5]);
    
    if (escrowInfo[4]) {
      console.log('\n❌ This escrow is already settled!');
      process.exit(1);
    }
    
    // Check deadline
    const now = Math.floor(Date.now() / 1000);
    const deadline = Number(escrowInfo[3]);
    
    if (now > deadline) {
      console.log('\n⚠️  Warning: Deadline has passed!');
      console.log('   This should fail on contract level');
    }
    
    // Cancel
    console.log('\n🚫 Cancelling task', taskId, '...');
    const reason = 'Testing cancel function';
    
    console.log('   Reason:', reason);
    const cancelTx = await escrow.cancel(taskId, reason);
    console.log('   Tx hash:', cancelTx.hash);
    console.log('   Waiting for confirmation...');
    
    const receipt = await cancelTx.wait();
    console.log('   ✅ Confirmed in block', receipt.blockNumber);
    
    // Parse Cancelled event
    const cancelledEvent = receipt.logs.find(log => {
      try {
        return escrow.interface.parseLog(log)?.name === 'Cancelled';
      } catch { return false; }
    });
    
    if (cancelledEvent) {
      const parsed = escrow.interface.parseLog(cancelledEvent);
      console.log('\n🚫 Cancelled Event:');
      console.log('━'.repeat(50));
      console.log('TaskId:', parsed.args.taskId.toString());
      console.log('Employer:', parsed.args.employer);
      console.log('Amount:', ethers.formatEther(parsed.args.amount), 'tokens');
      console.log('Reason:', parsed.args.reason);
    }
    
    console.log('\n✅ Cancel test successful!');
    console.log('💡 Check backend logs for event sync');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('revert')) {
      console.error('\n🔍 Possible reasons:');
      console.error('   - Deadline has passed (use releaseAfterDeadline instead)');
      console.error('   - Not employer or admin');
      console.error('   - Task already settled');
    }
    
    process.exit(1);
  }
}

testCancel();
