// scripts/test-contract.mjs
/**
 * Verify contract deployment and basic info
 * Run: node scripts/test-contract.mjs
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function testContract() {
  try {
    console.log('📋 Testing Contract Deployment\n');
    
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const signer = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY, provider);
    
    const contractABI = [
      'function taskCount() view returns (uint256)',
      'function token() view returns (address)',
      'function hasRole(bytes32 role, address account) view returns (bool)',
      'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
    ];
    
    const contract = new ethers.Contract(
      process.env.CONTRACT_ADDRESS,
      contractABI,
      provider
    );

    console.log('🔗 Contract Information:');
    console.log('━'.repeat(50));
    console.log('Address:', process.env.CONTRACT_ADDRESS);
    console.log('Token:', await contract.token());
    console.log('Task Count:', (await contract.taskCount()).toString());
    console.log('RPC URL:', process.env.RPC_URL);
    
    const adminRole = await contract.DEFAULT_ADMIN_ROLE();
    const isAdmin = await contract.hasRole(adminRole, signer.address);
    console.log('\n👤 Admin Information:');
    console.log('━'.repeat(50));
    console.log('Admin Address:', signer.address);
    console.log('Admin Role:', adminRole);
    console.log('Is Admin:', isAdmin ? '✅ Yes' : '❌ No');
    
    if (!isAdmin) {
      console.log('\n⚠️  Warning: Current address is not admin!');
      process.exit(1);
    }
    
    console.log('\n✅ Contract verification successful!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testContract();
