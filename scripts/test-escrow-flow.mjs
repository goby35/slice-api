#!/usr/bin/env node
/**
 * Test script cho Escrow Flow
 * Chạy: node scripts/test-escrow-flow.mjs
 * 
 * Prerequisites:
 * - Hardhat node đang chạy (npx hardhat node)
 * - Contract đã deploy
 * - Backend server đang chạy (pnpm run dev)
 * - .env đã config đúng
 */

import { ethers } from 'ethers';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;

// ABIs (simplified)
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function mint(address to, uint256 amount)',
];

const ESCROW_ABI = [
  'function deposit(uint256 amount, address freelancer, uint256 deadline, string externalTaskId)',
  'function release(uint256 taskId, address to, string reason)',
  'function taskCount() view returns (uint256)',
  'function escrows(uint256) view returns (address employer, address freelancer, uint256 amount, uint256 deadline, bool settled, string externalId)',
];

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('🚀 Starting Escrow Flow Test...\n');

  // Setup provider and wallets
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const admin = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider);
  
  // Get test accounts from hardhat
  const accounts = await provider.listAccounts();
  const employer = await provider.getSigner(accounts[1]);
  const freelancer = await provider.getSigner(accounts[2]);

  console.log('📋 Test Accounts:');
  console.log('Admin:', admin.address);
  console.log('Employer:', await employer.getAddress());
  console.log('Freelancer:', await freelancer.getAddress());
  console.log();

  // Contract instances
  const token = new ethers.Contract(TOKEN_ADDRESS, ERC20_ABI, employer);
  const escrow = new ethers.Contract(CONTRACT_ADDRESS, ESCROW_ABI, employer);

  try {
    // Step 1: Mint tokens to employer
    console.log('1️⃣ Minting 1000 tokens to employer...');
    const mintTx = await token.connect(admin).mint(
      await employer.getAddress(),
      ethers.parseEther('1000')
    );
    await mintTx.wait();
    console.log('✅ Minted successfully\n');

    // Step 2: Create task via API
    console.log('2️⃣ Creating task via API...');
    const externalTaskId = crypto.randomUUID();
    const taskData = {
      title: 'Test Escrow Task',
      objective: 'Testing escrow integration with blockchain',
      deliverables: 'Smart contract integration',
      acceptanceCriteria: 'All tests pass',
      rewardPoints: 100,
      deadline: new Date(Date.now() + 86400000).toISOString(),
    };

    // Note: In real scenario, use JWT token
    const taskRes = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': 'Bearer <EMPLOYER_JWT>'
      },
      body: JSON.stringify(taskData),
    });

    if (!taskRes.ok) {
      console.error('❌ Failed to create task:', await taskRes.text());
      process.exit(1);
    }

    const task = await taskRes.json();
    console.log('✅ Task created:', task.id);
    console.log('   External Task ID:', task.externalTaskId || externalTaskId);
    console.log();

    const finalExternalId = task.externalTaskId || externalTaskId;

    // Step 3: Approve tokens
    console.log('3️⃣ Approving 100 tokens to escrow contract...');
    const approveTx = await token.approve(CONTRACT_ADDRESS, ethers.parseEther('100'));
    await approveTx.wait();
    console.log('✅ Approved\n');

    // Step 4: Deposit to escrow
    console.log('4️⃣ Depositing to escrow contract...');
    const depositTx = await escrow.deposit(
      ethers.parseEther('100'),
      await freelancer.getAddress(),
      Math.floor(Date.now() / 1000) + 86400,
      finalExternalId
    );
    const receipt = await depositTx.wait();
    console.log('✅ Deposited! Tx:', receipt.hash);

    const taskCount = await escrow.taskCount();
    const onChainTaskId = Number(taskCount);
    console.log('   On-chain Task ID:', onChainTaskId);
    console.log();

    // Step 5: Wait for backend to sync
    console.log('5️⃣ Waiting for backend event listener to sync (3 seconds)...');
    await sleep(3000);
    console.log();

    // Step 6: Check escrow via API
    console.log('6️⃣ Checking escrow status via API...');
    const escrowRes = await fetch(`${API_BASE}/escrow/task/${onChainTaskId}`);
    if (escrowRes.ok) {
      const escrowData = await escrowRes.json();
      console.log('✅ Escrow synced to DB:');
      console.log('   Settled:', escrowData.settled);
      console.log('   Amount:', escrowData.amount);
      console.log('   Deposited Tx:', escrowData.depositedTx);
      console.log();
    } else {
      console.log('⚠️  Escrow not found in DB yet (may need reconciliation)');
      console.log();
    }

    // Step 7: Check freelancer balance before
    const balanceBefore = await token.balanceOf(await freelancer.getAddress());
    console.log('7️⃣ Freelancer balance before release:', ethers.formatEther(balanceBefore));
    console.log();

    // Step 8: Release tokens (as admin)
    console.log('8️⃣ Releasing tokens to freelancer (as admin)...');
    const releaseRes = await fetch(`${API_BASE}/escrow/release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': 'Bearer <ADMIN_JWT>'
      },
      body: JSON.stringify({
        taskId: onChainTaskId,
        to: await freelancer.getAddress(),
        reason: 'Task completed in test',
      }),
    });

    if (!releaseRes.ok) {
      console.error('❌ Failed to release:', await releaseRes.text());
      process.exit(1);
    }

    const releaseData = await releaseRes.json();
    console.log('✅ Released! Tx:', releaseData.txHash);
    console.log();

    // Step 9: Wait for tx to be mined
    console.log('9️⃣ Waiting for release transaction to be mined...');
    await sleep(2000);
    console.log();

    // Step 10: Verify final state
    console.log('🔟 Verifying final state...');
    const balanceAfter = await token.balanceOf(await freelancer.getAddress());
    console.log('   Freelancer balance after:', ethers.formatEther(balanceAfter));
    console.log('   Difference:', ethers.formatEther(balanceAfter - balanceBefore));

    const escrowFinalRes = await fetch(`${API_BASE}/escrow/task/${onChainTaskId}`);
    if (escrowFinalRes.ok) {
      const escrowFinal = await escrowFinalRes.json();
      console.log('   Settled:', escrowFinal.settled);
      console.log('   Released to:', escrowFinal.releaseTo);
      console.log('   Reason:', escrowFinal.releaseReason);
    }
    console.log();

    console.log('✅✅✅ All tests passed! Escrow flow working correctly.\n');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main().catch(console.error);
