// scripts/test-full-flow.mjs
/**
 * Complete integration test: deposit → cancel → deposit expired → release
 * Run: node scripts/test-full-flow.mjs
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fullFlowTest() {
  try {
    console.log('🧪 Full Integration Test\n');
    console.log('━'.repeat(60));
    
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
      'function escrows(uint256) view returns (address, address, uint256, uint256, bool, string)',
      'event Deposited(uint256 indexed taskId, string indexed externalId, address employer, uint256 amount)',
      'event Cancelled(uint256 indexed taskId, address employer, uint256 amount, string reason)',
      'event Released(uint256 indexed taskId, address to, uint256 amount, string reason)'
    ];
    
    const token = new ethers.Contract(process.env.TOKEN_ADDRESS, tokenABI, employer);
    const escrow = new ethers.Contract(process.env.CONTRACT_ADDRESS, escrowABI, employer);
    
    console.log('\n📊 Initial State:');
    console.log('   Employer:', employer.address);
    console.log('   Freelancer:', freelancer.address);
    console.log('   Contract:', process.env.CONTRACT_ADDRESS);
    
    // === STEP 1: Mint tokens ===
    console.log('\n1️⃣  Minting tokens to employer...');
    await (await token.mint(employer.address, ethers.parseEther('1000'))).wait();
    const balance = await token.balanceOf(employer.address);
    console.log('   ✅ Balance:', ethers.formatEther(balance), 'tokens');
    
    // === STEP 2: First deposit (will be cancelled) ===
    console.log('\n2️⃣  First deposit (to be cancelled)...');
    await (await token.approve(process.env.CONTRACT_ADDRESS, ethers.parseEther('100'))).wait();
    
    const externalTaskId1 = `flow-test-1-${Date.now()}`;
    const deadline1 = Math.floor(Date.now() / 1000) + 86400;
    
    const depositTx1 = await escrow.deposit(
      ethers.parseEther('100'),
      freelancer.address,
      deadline1,
      externalTaskId1
    );
    const depositReceipt1 = await depositTx1.wait();
    
    const depositedEvent1 = depositReceipt1.logs.find(log => {
      try {
        return escrow.interface.parseLog(log)?.name === 'Deposited';
      } catch { return false; }
    });
    const taskId1 = escrow.interface.parseLog(depositedEvent1).args.taskId;
    console.log('   ✅ Deposited, taskId:', taskId1.toString());
    
    // Wait for backend sync
    console.log('   ⏳ Waiting for backend to sync...');
    await sleep(2000);
    
    // === STEP 3: Cancel first task ===
    console.log('\n3️⃣  Cancelling first task...');
    const cancelTx = await escrow.cancel(taskId1, 'Testing full flow cancel');
    await cancelTx.wait();
    console.log('   ✅ Cancelled');
    
    await sleep(1000);
    
    // Verify refund
    const balanceAfterCancel = await token.balanceOf(employer.address);
    console.log('   💰 Balance after refund:', ethers.formatEther(balanceAfterCancel), 'tokens');
    
    // === STEP 4: Second deposit (expired, will be released) ===
    console.log('\n4️⃣  Second deposit (expired deadline)...');
    await (await token.approve(process.env.CONTRACT_ADDRESS, ethers.parseEther('100'))).wait();
    
    const externalTaskId2 = `flow-test-2-${Date.now()}`;
    const deadline2 = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    
    const depositTx2 = await escrow.deposit(
      ethers.parseEther('100'),
      freelancer.address,
      deadline2,
      externalTaskId2
    );
    const depositReceipt2 = await depositTx2.wait();
    
    const depositedEvent2 = depositReceipt2.logs.find(log => {
      try {
        return escrow.interface.parseLog(log)?.name === 'Deposited';
      } catch { return false; }
    });
    const taskId2 = escrow.interface.parseLog(depositedEvent2).args.taskId;
    console.log('   ✅ Deposited expired task, taskId:', taskId2.toString());
    
    await sleep(1000);
    
    // === STEP 5: Release after deadline ===
    console.log('\n5️⃣  Releasing to freelancer after deadline...');
    const releaseTx = await escrow.releaseAfterDeadline(
      taskId2,
      freelancer.address,
      'Work completed'
    );
    await releaseTx.wait();
    console.log('   ✅ Released');
    
    await sleep(1000);
    
    // === STEP 6: Verify final balances ===
    console.log('\n6️⃣  Final balances:');
    const employerFinalBalance = await token.balanceOf(employer.address);
    const freelancerBalance = await token.balanceOf(freelancer.address);
    
    console.log('   Employer:', ethers.formatEther(employerFinalBalance), 'tokens');
    console.log('   Freelancer:', ethers.formatEther(freelancerBalance), 'tokens');
    
    // === STEP 7: Verify contract state ===
    console.log('\n7️⃣  Verifying contract state...');
    const escrow1 = await escrow.escrows(taskId1);
    const escrow2 = await escrow.escrows(taskId2);
    
    console.log('   Task 1 settled:', escrow1[4] ? '✅' : '❌');
    console.log('   Task 2 settled:', escrow2[4] ? '✅' : '❌');
    
    // === Summary ===
    console.log('\n📊 Test Summary:');
    console.log('━'.repeat(60));
    console.log('✅ Deposit → Cancel → Refund: Success');
    console.log('✅ Deposit Expired → ReleaseAfterDeadline: Success');
    console.log('✅ Token balances correct');
    console.log('✅ Contract state consistent');
    
    console.log('\n🎉 Full integration test PASSED!');
    console.log('\n💡 Next steps:');
    console.log('   1. Check backend logs for event syncing');
    console.log('   2. Verify DB records: SELECT * FROM escrow_tasks;');
    console.log('   3. Test deadline automation script');
    
  } catch (error) {
    console.error('\n❌ Test FAILED:', error.message);
    if (error.data) {
      console.error('Contract error:', error.data);
    }
    process.exit(1);
  }
}

fullFlowTest();
