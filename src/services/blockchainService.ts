// src/services/blockchainService.ts
import { ethers } from "ethers";
import { db } from "../db/index.js";
import { escrowTasks } from "../db/schema.js";
import { eq } from "drizzle-orm";

// TaskEscrowPool ABI (updated with new contract functions)
const ESCROW_ABI = [
  "event Deposited(uint256 indexed taskId, string indexed externalId, address employer, uint256 amount)",
  "event Released(uint256 indexed taskId, address to, uint256 amount, string reason)",
  "event Cancelled(uint256 indexed taskId, address employer, uint256 amount, string reason)",
  "function escrows(uint256 taskId) view returns (address employer, address freelancer, uint256 amount, uint256 deadline, bool settled, string externalTaskId)",
  "function externalToInternal(string externalId) view returns (uint256)",
  "function taskCount() view returns (uint256)",
  "function token() view returns (address)",
  "function release(uint256 taskId, address to, string reason)",
  "function cancel(uint256 taskId, string reason)",
  "function releaseAfterDeadline(uint256 taskId, address to, string reason)",
  "function deposit(uint256 amount, address freelancer, uint256 deadline, string externalTaskId)"
];

let provider: ethers.JsonRpcProvider | null = null;
let contract: ethers.Contract | null = null;
let adminWallet: ethers.Wallet | null = null;

export function initBlockchain() {
  const rpcUrl = process.env.RPC_URL;
  const contractAddress = process.env.ESCROW_CONTRACT_ADDRESS;
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;

  if (!rpcUrl || !contractAddress) {
    console.warn("⚠️  Blockchain env vars not set. Escrow features disabled.");
    return;
  }

  provider = new ethers.JsonRpcProvider(rpcUrl);

  provider.getNetwork().then((network) => {
    console.log("✅ Connected to blockchain network:", {
      name: network.name,
      chainId: network.chainId
    });

    // Check if it's zkSync Era
    if (network.chainId === 324n || network.chainId === 300n) {
      console.log("🔎 Detected zkSync Era network");
    }

  }).catch((error) => {
    console.error("❌ Error connecting to blockchain:", error);
  });
  
  contract = new ethers.Contract(contractAddress, ESCROW_ABI, provider);

  if (adminPrivateKey) {
    adminWallet = new ethers.Wallet(adminPrivateKey, provider);
    console.log("✅ Admin wallet loaded:", adminWallet.address);
  }

  console.log("✅ Blockchain service initialized");
  console.log("   Contract:", contractAddress);
  console.log("   RPC:", rpcUrl);
}

export function getContract() {
  if (!contract) throw new Error("Blockchain not initialized");
  return contract;
}

export function getProvider() {
  if (!provider) throw new Error("Blockchain not initialized");
  return provider;
}

export function getAdminWallet() {
  if (!adminWallet) throw new Error("Admin wallet not configured");
  return adminWallet;
}

// ===== EVENT LISTENERS =====

export function startEventListeners() {
  if (!contract) {
    console.warn("⚠️  Cannot start event listeners: blockchain not initialized");
    return;
  }

  console.log("🎧 Starting blockchain event listeners...");

  // Listen to Deposited events
  contract.on(
    "Deposited",
    async (
      taskId: bigint,
      externalId: string,
      employer: string,
      amount: bigint,
      event: any
    ) => {
      try {
        console.log("📥 Deposited event:", {
          taskId: taskId.toString(),
          externalId,
          employer,
          amount: amount.toString(),
          txHash: event.log.transactionHash
        });

        // Fetch full escrow data from contract
        const escrowData = await contract!.escrows(taskId);
        
        // Insert/update DB
        await db
          .insert(escrowTasks)
          .values({
            taskId: taskId.toString(),
            externalTaskId: externalId,
            employer: escrowData.employer.toLowerCase(),
            freelancer: escrowData.freelancer.toLowerCase(),
            amount: escrowData.amount.toString(),
            deadline: Number(escrowData.deadline),
            settled: escrowData.settled ? 1 : 0,
            depositedTx: event.log.transactionHash,
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

        console.log("✅ Synced Deposited event to DB");
      } catch (error) {
        console.error("❌ Error handling Deposited event:", error);
      }
    }
  );

  // Listen to Released events
  contract.on(
    "Released",
    async (
      taskId: bigint,
      to: string,
      amount: bigint,
      reason: string,
      event: any
    ) => {
      try {
        console.log("📤 Released event:", {
          taskId: taskId.toString(),
          to,
          amount: amount.toString(),
          reason,
          txHash: event.log.transactionHash
        });

        // Update DB
        await db
          .update(escrowTasks)
          .set({
            settled: 1,
            releasedTx: event.log.transactionHash,
            releasedAt: new Date(),
            releaseTo: to.toLowerCase(),
            releaseReason: reason
          })
          .where(eq(escrowTasks.taskId, taskId.toString()));

        console.log("✅ Synced Released event to DB");
      } catch (error) {
        console.error("❌ Error handling Released event:", error);
      }
    }
  );

  // Listen to Cancelled events
  contract.on(
    "Cancelled",
    async (
      taskId: bigint,
      employer: string,
      amount: bigint,
      reason: string,
      event: any
    ) => {
      try {
        console.log("🚫 Cancelled event:", {
          taskId: taskId.toString(),
          employer,
          amount: amount.toString(),
          reason,
          txHash: event.log.transactionHash
        });

        // Update DB - same as Released but mark as cancelled
        await db
          .update(escrowTasks)
          .set({
            settled: 1,
            releasedTx: event.log.transactionHash,
            releasedAt: new Date(),
            releaseTo: employer.toLowerCase(), // Refunded to employer
            releaseReason: `Cancelled: ${reason}`
          })
          .where(eq(escrowTasks.taskId, taskId.toString()));

        console.log("✅ Synced Cancelled event to DB");
      } catch (error) {
        console.error("❌ Error handling Cancelled event:", error);
      }
    }
  );

  console.log("✅ Event listeners started (Deposited, Released, Cancelled)");
}

// ===== CONTRACT INTERACTIONS =====

export async function getEscrowByTaskId(taskId: string) {
  const contract = getContract();
  const escrowData = await contract.escrows(BigInt(taskId));
  return {
    employer: escrowData.employer,
    freelancer: escrowData.freelancer,
    amount: escrowData.amount.toString(),
    deadline: Number(escrowData.deadline),
    settled: escrowData.settled
  };
}

export async function getTaskIdByExternalId(externalId: string): Promise<string> {
  const contract = getContract();
  const taskId = await contract.externalToInternal(externalId);
  return taskId.toString();
}

export async function releaseEscrow(taskId: string, to: string, reason: string) {
  const wallet = getAdminWallet();
  const contractWithSigner = getContract().connect(wallet) as ethers.Contract;

  // Estimate gas with 20% buffer to prevent out-of-gas
  try {
    const estimatedGas = await contractWithSigner.release.estimateGas(BigInt(taskId), to, reason);
    console.log("💰 Estimated gas for release:", { estimatedGas: estimatedGas.toString(), estimatedGasFormatted: ethers.formatUnits(estimatedGas, "gwei") + " gwei" });
    
    if (estimatedGas > 5_000_000n) {
      throw new Error(`Gas estimate quá cao: ${estimatedGas.toString()}. Transaction có thể sẽ revert. ` +
        `Kiểm tra: escrow đã settled? deadline đã qua?`);
    }

    const gasLimit = (estimatedGas * 130n) / 100n; // Add 30% buffer
    const maxGasLimit = 5_000_000n;
    const finalGasLimit = gasLimit > maxGasLimit ? maxGasLimit : gasLimit;

    console.log("💰 Using gas limit for release:", finalGasLimit.toString());

    // 🔍 4. Fetch current gas price
    const feeData = await getProvider().getFeeData();
    console.log("💰 Current Fee Data:", {
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
      gasPrice: feeData.gasPrice?.toString()
    });

    // 5. Calculate max fee (use network's current price)
    const maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits("0.1", "gwei");
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits("0.05", "gwei");

    // 🚨 6. Estimate total cost
    const estimatedCost = finalGasLimit * maxFeePerGas;
    const estimatedCostETH = ethers.formatEther(estimatedCost);
    
    console.log("💰 Transaction Cost Estimate:", {
      gasLimit: finalGasLimit.toString(),
      maxFeePerGas: ethers.formatUnits(maxFeePerGas, "gwei") + " gwei",
      maxPriorityFeePerGas: ethers.formatUnits(maxPriorityFeePerGas, "gwei") + " gwei",
      estimatedCostETH: estimatedCostETH + " ETH",
      estimatedCostUSD: "~" + (parseFloat(estimatedCostETH) * 3000).toFixed(2) + " USD (giả định ETH=$3000)"
    });

    // 🛑 7. Safety check: Abort nếu phí > $100
    if (parseFloat(estimatedCostETH) > 0.033) { // ~$100 nếu ETH=$3000
      throw new Error(
        `⚠️ PHÍ GAS QUÁ CAO: ${estimatedCostETH} ETH. ` +
        `Vui lòng kiểm tra lại transaction hoặc network congestion.`
      );
    }

    // 8. Send transaction
    const tx = await contractWithSigner.release(BigInt(taskId), to, reason, {
      gasLimit: finalGasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas
    });
    
    console.log("📤 Release tx sent:", tx.hash);
    
    const receipt = await tx.wait();
    console.log("✅ Release confirmed:", {
      hash: receipt.hash,
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPrice: receipt.gasPrice?.toString()
    });
    
    return receipt;
  } catch (error: any) {
    console.error("❌ releaseEscrow failed:", error.message);
    throw error;
  }
  }


export async function cancelEscrow(taskId: string, reason: string) {
  const wallet = getAdminWallet();
  const contractWithSigner = getContract().connect(wallet) as ethers.Contract;

  // Estimate gas with 20% buffer
  const estimatedGas = await contractWithSigner.cancel.estimateGas(BigInt(taskId), reason);
  const gasLimit = (estimatedGas * 120n) / 100n;

  // Get current gas price and cap it
  const feeData = await getProvider().getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits("50", "gwei");
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits("2", "gwei");

  console.log("💰 Gas settings:", {
    gasLimit: gasLimit.toString(),
    maxFeePerGas: ethers.formatUnits(maxFeePerGas, "gwei") + " gwei"
  });

  const tx = await contractWithSigner.cancel(BigInt(taskId), reason, {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas
  });
  console.log("🚫 Cancel tx sent:", tx.hash);
  
  const receipt = await tx.wait();
  console.log("✅ Cancel confirmed:", receipt.hash);
  
  return receipt;
}

export async function releaseAfterDeadline(taskId: string, to: string, reason: string) {
  const wallet = getAdminWallet();
  const contractWithSigner = getContract().connect(wallet) as ethers.Contract;

  // Estimate gas with 20% buffer
  const estimatedGas = await contractWithSigner.releaseAfterDeadline.estimateGas(BigInt(taskId), to, reason);
  const gasLimit = (estimatedGas * 120n) / 100n;

  // Get current gas price and cap it
  const feeData = await getProvider().getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits("50", "gwei");
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits("2", "gwei");

  console.log("💰 Gas settings:", {
    gasLimit: gasLimit.toString(),
    maxFeePerGas: ethers.formatUnits(maxFeePerGas, "gwei") + " gwei"
  });

  const tx = await contractWithSigner.releaseAfterDeadline(BigInt(taskId), to, reason, {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas
  });
  console.log("⏰ ReleaseAfterDeadline tx sent:", tx.hash);
  
  const receipt = await tx.wait();
  console.log("✅ ReleaseAfterDeadline confirmed:", receipt.hash);
  
  return receipt;
}

/**
 * Verify that a deposit exists on-chain for given externalTaskId and freelancerAddress
 * Returns { valid: true, onChainTaskId, escrow } if valid, otherwise { valid: false, reason }
 */
export async function verifyEscrowDeposit(
  externalTaskId: string,
  expectedFreelancerAddress: string
): Promise<
  | { valid: true; onChainTaskId: string; escrow: any }
  | { valid: false; reason: string }
> {
  try {
    const contract = getContract();

    // 1. Get on-chain taskId from externalTaskId
    const onChainTaskId = await contract.externalToInternal(externalTaskId);

    if (onChainTaskId === 0n) {
      return {
        valid: false,
        reason: "Chưa có đơn ký quỹ on-chain cho task này. Vui lòng hoàn tất deposit trước."
      };
    }

    // 2. Get escrow details
    const escrow = await contract.escrows(onChainTaskId);

    // 3. Check if settled
    if (escrow.settled) {
      return {
        valid: false,
        reason: "Đơn ký quỹ đã được giải ngân. Không thể chấp nhận application."
      };
    }

    // 4. Check freelancer address matches
    const freelancerLower = escrow.freelancer.toLowerCase();
    const expectedLower = expectedFreelancerAddress.toLowerCase();

    if (freelancerLower !== expectedLower) {
      return {
        valid: false,
        reason: `Đơn ký quỹ tồn tại nhưng dành cho freelancer khác (${escrow.freelancer}). Vui lòng deposit lại với địa chỉ đúng.`
      };
    }

    // All checks passed
    return {
      valid: true,
      onChainTaskId: onChainTaskId.toString(),
      escrow: {
        employer: escrow.employer,
        freelancer: escrow.freelancer,
        amount: escrow.amount.toString(),
        deadline: Number(escrow.deadline),
        settled: escrow.settled,
        externalTaskId: escrow.externalTaskId
      }
    };
  } catch (error: any) {
    console.error("❌ Error verifying escrow deposit:", error);
    return {
      valid: false,
      reason: `Lỗi khi kiểm tra on-chain: ${error.message}`
    };
  }
}

// ===== SYNC HELPERS =====

export async function syncTaskFromBlockchain(taskId: string) {
  const contract = getContract();
  const escrowData = await contract.escrows(BigInt(taskId));

  if (escrowData.employer === ethers.ZeroAddress) {
    throw new Error("Task not found on blockchain");
  }

  // Get externalTaskId from contract
  // Note: contract doesn't expose reverse mapping, so we query DB
  const [existingTask] = await db
    .select()
    .from(escrowTasks)
    .where(eq(escrowTasks.taskId, taskId))
    .limit(1);

  if (!existingTask) {
    throw new Error("Cannot sync: externalTaskId unknown. Run reconciliation.");
  }

  await db
    .update(escrowTasks)
    .set({
      employer: escrowData.employer.toLowerCase(),
      freelancer: escrowData.freelancer.toLowerCase(),
      amount: escrowData.amount.toString(),
      deadline: Number(escrowData.deadline),
      settled: escrowData.settled ? 1 : 0
    })
    .where(eq(escrowTasks.taskId, taskId));

  return escrowData;
}

// Validate TRƯỚC KHI gọi release
export async function validateReleaseConditions(taskId: string, to: string) {
  const contract = getContract();
  
  // 1. Check escrow exists
  const escrow = await contract.escrows(BigInt(taskId));
  
  if (escrow.employer === ethers.ZeroAddress) {
    throw new Error(`Task ${taskId} không tồn tại on-chain`);
  }
  
  if (escrow.settled) {
    throw new Error(`Task ${taskId} đã được settled rồi`);
  }
  
  if (escrow.amount === 0n) {
    throw new Error(`Task ${taskId} không có tiền trong escrow`);
  }
  
  console.log("✅ Validation passed:", {
    taskId,
    employer: escrow.employer,
    freelancer: escrow.freelancer,
    amount: ethers.formatUnits(escrow.amount, 18),
    deadline: new Date(Number(escrow.deadline) * 1000).toISOString(),
    settled: escrow.settled
  });
  
  return true;
}

// Gọi trước khi release
export async function releaseEscrowSafe(taskId: string, to: string, reason: string) {
  await validateReleaseConditions(taskId, to); // Validate trước
  return releaseEscrow(taskId, to, reason);
}

