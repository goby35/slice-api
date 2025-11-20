// scripts/test-deposit.mjs
/**
 * Test deposit flow: mint → approve → deposit
 * Run: node scripts/test-deposit.mjs
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function testDeposit() {
  try {
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
    
    console.log('💰 Testing Deposit Flow\n');
    console.log('━'.repeat(50));
    
    // Step 1: Check/Mint tokens
    console.log('\n1️⃣  Preparing tokens...');
    let balance = await token.balanceOf(employer.address);
    console.log('   Current balance:', ethers.formatEther(balance), 'tokens');
    
    if (balance < ethers.parseEther('100')) {
      console.log('   Minting 1000 tokens...');
      const mintTx = await token.mint(employer.address, ethers.parseEther('1000'));
      await mintTx.wait();
      balance = await token.balanceOf(employer.address);
      console.log('   ✅ New balance:', ethers.formatEther(balance), 'tokens');
    } else {
      console.log('   ✅ Sufficient balance');
    }
    
    // Step 2: Approve escrow contract
    console.log('\n2️⃣  Approving escrow contract...');
    const approveTx = await token.approve(
      process.env.CONTRACT_ADDRESS,
      ethers.parseEther('100')
    );
    console.log('   Tx hash:', approveTx.hash);
    await approveTx.wait();
    console.log('   ✅ Approved 100 tokens');
    
    // Step 3: Deposit escrow
    console.log('\n3️⃣  Depositing escrow...');
    const externalTaskId = `test-task-${Date.now()}`;
    const freelancerAddress = process.env.FREELANCER_ADDRESS;
    const amount = ethers.parseEther('100');
    const deadline = Math.floor(Date.now() / 1000) + 86400; // +24 hours
    
    console.log('   External Task ID:', externalTaskId);
    console.log('   Freelancer:', freelancerAddress);
    console.log('   Amount:', ethers.formatEther(amount), 'tokens');
    console.log('   Deadline:', new Date(deadline * 1000).toISOString());
    
    const depositTx = await escrow.deposit(
      amount,
      freelancerAddress,
      deadline,
      externalTaskId
    );
    
    console.log('\n   Tx hash:', depositTx.hash);
    console.log('   Waiting for confirmation...');
    const receipt = await depositTx.wait();
    console.log('   ✅ Confirmed in block', receipt.blockNumber);
    
    // Parse Deposited event
    const depositedEvent = receipt.logs.find(log => {
      try {
        return escrow.interface.parseLog(log)?.name === 'Deposited';
      } catch { return false; }
    });
    
    if (depositedEvent) {
      const parsed = escrow.interface.parseLog(depositedEvent);
      console.log('\n📦 Deposited Event:');
      console.log('━'.repeat(50));
      console.log('TaskId:', parsed.args.taskId.toString());
      console.log('External ID:', parsed.args.externalId);
      console.log('Employer:', parsed.args.employer);
      console.log('Amount:', ethers.formatEther(parsed.args.amount), 'tokens');
      
      console.log('\n💡 Save this taskId for other tests!');
      console.log('   TaskId:', parsed.args.taskId.toString());
    }
    
    console.log('\n✅ Deposit test successful!');
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.data) {
      console.error('Contract error:', error.data);
    }
    process.exit(1);
  }
}

testDeposit();
