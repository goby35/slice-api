// scripts/test-release-after-deadline.mjs
/**
 * Test releaseAfterDeadline function
 * Run: node scripts/test-release-after-deadline.mjs
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function testReleaseAfterDeadline() {
  try {
    console.log('⏰ Testing ReleaseAfterDeadline\n');
    console.log('━'.repeat(50));
    
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const employer = new ethers.Wallet(process.env.EMPLOYER_PRIVATE_KEY, provider);
    const freelancer = new ethers.Wallet(process.env.FREELANCER_PRIVATE_KEY, provider);
    
    const tokenABI = [
      'function mint(address to, uint256 amount)',
      'function approve(address spender, uint256 amount)',
      'function balanceOf(address) view returns (uint256)'
    ];
    
    const escrowABI = [
      'function deposit(uint256 amount, address freelancer, uint256 deadline, string externalTaskId)',
      'function releaseAfterDeadline(uint256 taskId, address to, string reason)',
      'event Deposited(uint256 indexed taskId, string indexed externalId, address employer, uint256 amount)',
      'event Released(uint256 indexed taskId, address to, uint256 amount, string reason)'
    ];
    
    const token = new ethers.Contract(process.env.TOKEN_ADDRESS, tokenABI, employer);
    const escrow = new ethers.Contract(process.env.CONTRACT_ADDRESS, escrowABI, employer);
    
    // Step 1: Create expired escrow
    console.log('1️⃣  Creating expired escrow...');
    
    // Mint and approve
    console.log('   Minting tokens...');
    await (await token.mint(employer.address, ethers.parseEther('100'))).wait();
    console.log('   Approving...');
    await (await token.approve(process.env.CONTRACT_ADDRESS, ethers.parseEther('100'))).wait();
    
    // Deposit with deadline in past
    const externalTaskId = `expired-task-${Date.now()}`;
    const deadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    
    console.log('   External Task ID:', externalTaskId);
    console.log('   Deadline:', new Date(deadline * 1000).toISOString(), '(expired)');
    console.log('   Depositing...');
    
    const depositTx = await escrow.deposit(
      ethers.parseEther('100'),
      freelancer.address,
      deadline,
      externalTaskId
    );
    const depositReceipt = await depositTx.wait();
    
    // Get taskId from event
    const depositedEvent = depositReceipt.logs.find(log => {
      try {
        return escrow.interface.parseLog(log)?.name === 'Deposited';
      } catch { return false; }
    });
    const taskId = escrow.interface.parseLog(depositedEvent).args.taskId;
    console.log('   ✅ Created expired task:', taskId.toString());
    
    // Step 2: Release after deadline to freelancer
    console.log('\n2️⃣  Releasing to freelancer after deadline...');
    console.log('   TaskId:', taskId.toString());
    console.log('   To:', freelancer.address);
    console.log('   Reason: Deadline passed, work was submitted');
    
    const releaseTx = await escrow.releaseAfterDeadline(
      taskId,
      freelancer.address,
      'Deadline passed, work was submitted'
    );
    console.log('   Tx hash:', releaseTx.hash);
    console.log('   Waiting for confirmation...');
    
    const releaseReceipt = await releaseTx.wait();
    console.log('   ✅ Confirmed in block', releaseReceipt.blockNumber);
    
    // Parse Released event
    const releasedEvent = releaseReceipt.logs.find(log => {
      try {
        return escrow.interface.parseLog(log)?.name === 'Released';
      } catch { return false; }
    });
    
    if (releasedEvent) {
      const parsed = escrow.interface.parseLog(releasedEvent);
      console.log('\n📤 Released Event:');
      console.log('━'.repeat(50));
      console.log('TaskId:', parsed.args.taskId.toString());
      console.log('To:', parsed.args.to);
      console.log('Amount:', ethers.formatEther(parsed.args.amount), 'tokens');
      console.log('Reason:', parsed.args.reason);
    }
    
    // Step 3: Verify freelancer balance
    console.log('\n3️⃣  Verifying freelancer balance...');
    const freelancerBalance = await token.balanceOf(freelancer.address);
    console.log('   Freelancer balance:', ethers.formatEther(freelancerBalance), 'tokens');
    
    console.log('\n✅ ReleaseAfterDeadline test successful!');
    console.log('💡 Check backend logs for event sync');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('revert')) {
      console.error('\n🔍 Possible reasons:');
      console.error('   - Deadline has not passed yet');
      console.error('   - Task already settled');
    }
    
    process.exit(1);
  }
}

testReleaseAfterDeadline();
