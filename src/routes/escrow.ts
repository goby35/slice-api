// src/routes/escrow.ts
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { ethers } from "ethers";
import { db } from "../db/index.js";
import { escrowTasks } from "../db/schema.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import {
  getEscrowByTaskId,
  getTaskIdByExternalId,
  releaseEscrow,
  cancelEscrow,
  syncTaskFromBlockchain,
  getContract,
  getAdminWallet,
  getProvider
} from "../services/blockchainService.js";

const escrowRouter = new Hono();

// GET /escrow/task/:taskId - Lấy thông tin escrow từ blockchain taskId
escrowRouter.get("/task/:taskId", async (c) => {
  try {
    const taskId = c.req.param("taskId");
    
    // Get from DB first
    const [escrowTask] = await db
      .select()
      .from(escrowTasks)
      .where(eq(escrowTasks.taskId, taskId))
      .limit(1);

    if (!escrowTask) {
      return c.json({ error: "Escrow task not found in DB" }, 404);
    }

    // Optionally fetch fresh data from blockchain
    try {
      const blockchainData = await getEscrowByTaskId(taskId);
      return c.json({
        db: escrowTask,
        blockchain: blockchainData
      });
    } catch (err) {
      // Blockchain call failed, return DB data only
      return c.json({ db: escrowTask, blockchain: null });
    }
  } catch (error) {
    console.error("Error fetching escrow task:", error);
    return c.json({ error: "Failed to fetch escrow task" }, 500);
  }
});

// GET /escrow/external/:externalTaskId - Lấy từ externalTaskId (UUID)
escrowRouter.get("/external/:externalTaskId", async (c) => {
  try {
    const externalTaskId = c.req.param("externalTaskId");

    const [escrowTask] = await db
      .select()
      .from(escrowTasks)
      .where(eq(escrowTasks.externalTaskId, externalTaskId))
      .limit(1);

    if (!escrowTask) {
      return c.json({ error: "Escrow task not found" }, 404);
    }

    return c.json(escrowTask);
  } catch (error) {
    console.error("Error fetching escrow by externalTaskId:", error);
    return c.json({ error: "Failed to fetch escrow task" }, 500);
  }
});

// POST /escrow/release - Admin release funds
const releaseSchema = z.object({
  taskId: z.string().min(1),
  to: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  reason: z.string().min(1)
});

// POST /escrow/release
escrowRouter.post(
  "/release",
  authMiddleware,
  zValidator("json", releaseSchema),
  async (c) => {
    try {
      // TODO: Check if user has ADMIN_ROLE (add admin check middleware)
      const userPayload = (c as any).get("user") as Record<string, any> | undefined;
      const profileId = userPayload?.act?.sub || userPayload?.sub;
      
      if (!profileId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Optional: verify admin role from DB
      // const [user] = await db.select().from(users).where(eq(users.profileId, profileId));
      // if (!user.isAdmin) return c.json({ error: "Forbidden: Admin only" }, 403);

      const data = (c.req as any).valid("json");
      
      // Call blockchain
      const receipt = await releaseEscrow(data.taskId, data.to, data.reason);

      // DB will auto-sync via event listener, but return receipt
      return c.json({
        message: "Release transaction sent",
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber
      });
    } catch (error: any) {
      console.error("Error releasing escrow:", error);
      return c.json({ 
        error: "Failed to release escrow",
        details: error.message 
      }, 500);
    }
  }
);

// GET /escrow/sync/:taskId - Force sync từ blockchain
escrowRouter.get("/sync/:taskId", authMiddleware, async (c) => {
  try {
    const taskId = c.req.param("taskId");
    const escrowData = await syncTaskFromBlockchain(taskId);
    
    return c.json({
      message: "Synced successfully",
      data: escrowData
    });
  } catch (error: any) {
    console.error("Error syncing escrow:", error);
    return c.json({ 
      error: "Failed to sync escrow",
      details: error.message 
    }, 500);
  }
});

// GET /escrow/all - Lấy tất cả escrow tasks (for admin)
escrowRouter.get("/all", authMiddleware, async (c) => {
  try {
    const allEscrows = await db.select().from(escrowTasks);
    return c.json(allEscrows);
  } catch (error) {
    console.error("Error fetching all escrows:", error);
    return c.json({ error: "Failed to fetch escrows" }, 500);
  }
});

// POST /escrow/cancel - Cancel task và hoàn tiền employer (before deadline)
const cancelSchema = z.object({
  taskId: z.string().uuid(), // Off-chain task UUID
  reason: z.string().min(1)
});

// POST /cancel
escrowRouter.post(
  "/cancel",
  authMiddleware,
  zValidator("json", cancelSchema),
  async (c) => {
    try {
      const data = (c.req as any).valid("json");
      const userPayload = (c as any).get("user") as Record<string, any> | undefined;
      const employerProfileId = userPayload?.act?.sub || userPayload?.sub;

      if (!employerProfileId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Import tasks and taskApplications schemas
      const { tasks, taskApplications } = await import("../db/schema.js");

      // Get task
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, data.taskId));

      if (!task) {
        return c.json({ error: "Task not found" }, 404);
      }

      // Check ownership
      if (task.employerProfileId !== employerProfileId) {
        return c.json({ error: "Not your task" }, 403);
      }

      if (!task.externalTaskId) {
        return c.json({ error: "Task has no external ID (escrow not initialized)" }, 400);
      }

      // Get escrow task
      const [escrowTask] = await db
        .select()
        .from(escrowTasks)
        .where(eq(escrowTasks.externalTaskId, task.externalTaskId));

      if (!escrowTask) {
        return c.json({ error: "No escrow found for this task" }, 404);
      }

      if (escrowTask.settled) {
        return c.json({ error: "Task already settled" }, 400);
      }

      // Check deadline not passed
      const now = Math.floor(Date.now() / 1000);
      if (now > escrowTask.deadline) {
        return c.json({ 
          error: "Cannot cancel after deadline. Deadline automation will handle this." 
        }, 400);
      }

      // Cancel escrow (refund employer using new cancel function)
      const receipt = await cancelEscrow(
        escrowTask.taskId,
        data.reason || "Cancelled by employer"
      );

      // Update DB
      await db
        .update(tasks)
        .set({ status: 'cancelled' })
        .where(eq(tasks.id, data.taskId));

      // Reject all applications
      await db
        .update(taskApplications)
        .set({ status: 'rejected' })
        .where(eq(taskApplications.taskId, data.taskId));

      return c.json({
        success: true,
        txHash: receipt.hash,
        message: "Task cancelled and tokens refunded to employer",
      });
    } catch (error: any) {
      console.error("Error cancelling task:", error);
      return c.json({ 
        error: "Failed to cancel task",
        details: error.message 
      }, 500);
    }
  }
);

// POST /escrow/complete - Complete task và release to freelancer (before deadline)
const completeSchema = z.object({
  taskId: z.string().uuid(), // Off-chain task UUID
  reason: z.string().optional(),
});

// POST /complete
escrowRouter.post(
  "/complete",
  authMiddleware,
  zValidator("json", completeSchema),
  async (c) => {
    try {
      const data = (c.req as any).valid("json");
      const userPayload = (c as any).get("user") as Record<string, any> | undefined;
      const employerProfileId = userPayload?.act?.sub || userPayload?.sub;

      if (!employerProfileId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { tasks, taskApplications } = await import("../db/schema.js");

      // Get task
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, data.taskId));

      if (!task) {
        return c.json({ error: "Task not found" }, 404);
      }

      // Check ownership
      if (task.employerProfileId !== employerProfileId) {
        return c.json({ error: "Not your task" }, 403);
      }

      if (!task.externalTaskId) {
        return c.json({ error: "Task has no external ID (escrow not initialized)" }, 400);
      }

      // Get escrow task
      const [escrowTask] = await db
        .select()
        .from(escrowTasks)
        .where(eq(escrowTasks.externalTaskId, task.externalTaskId));

      if (!escrowTask) {
        return c.json({ error: "No escrow found for this task" }, 404);
      }

      if (escrowTask.settled) {
        return c.json({ error: "Task already settled" }, 400);
      }

      // Release to freelancer
      const receipt = await releaseEscrow(
        escrowTask.taskId,
        escrowTask.freelancer,
        data.reason || "Task completed by employer"
      );

      // Update DB
      await db
        .update(tasks)
        .set({ status: 'completed' })
        .where(eq(tasks.id, data.taskId));

      // Complete all accepted applications
      await db
        .update(taskApplications)
        .set({ status: 'completed', completedAt: new Date() })
        .where(eq(taskApplications.taskId, data.taskId));

      return c.json({
        success: true,
        txHash: receipt.hash,
        message: "Task completed and tokens released to freelancer",
      });

      

    } catch (error: any) {
      console.error("Error completing task:", error);
      return c.json({ 
        error: "Failed to complete task",
        details: error.message 
      }, 500);
    }
  }
);

// POST /escrow/estimate-release - ước tính phí gas để release
escrowRouter.post("/estimate-release", authMiddleware, async (c) => {
  const { taskId, to, reason } = await c.req.json();
  const { validateReleaseConditions } = await import("../services/blockchainService.js");
  
  try {
    await validateReleaseConditions(taskId, to);
    
    const contract = getContract();
    const wallet = getAdminWallet();
    const contractWithSigner = contract.connect(wallet) as ethers.Contract;
    
    const estimatedGas = await contractWithSigner.release.estimateGas(
      BigInt(taskId), to, reason
    );
    
    const feeData = await getProvider().getFeeData();
    const maxFeePerGas = feeData.maxFeePerGas || feeData.gasPrice!;
    
    const cost = estimatedGas * maxFeePerGas;
    const costETH = ethers.formatEther(cost);
    
    return c.json({
      estimatedGas: estimatedGas.toString(),
      maxFeePerGas: ethers.formatUnits(maxFeePerGas, "gwei") + " gwei",
      estimatedCostETH: costETH,
      estimatedCostUSD: (parseFloat(costETH) * 3000).toFixed(2),
      safe: parseFloat(costETH) < 0.033
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

export default escrowRouter;
