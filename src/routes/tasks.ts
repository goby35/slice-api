import { zValidator } from "@hono/zod-validator";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { randomUUID } from "crypto";
import { db } from "../db/index.js";
import { tasks, taskChecklists, taskApplications, users } from "../db/schema.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import { notifyTaskCreated } from "../services/notificationService.js";
import { releaseEscrow } from "../services/blockchainService.js";

// Zod Schemas
const taskStatusSchema = z.enum([
  "open",
  "in_review",
  "in_progress",
  "completed",
  "cancelled"
]);

const checklistItemSchema = z.object({
  itemText: z.string().min(1),
  orderIndex: z.number().int().optional()
});

const createTaskSchema = z.object({
  // employerProfileId is intentionally NOT provided by client; server will derive it from JWT (act.sub || sub)
  title: z.string().min(3, "Title must be at least 3 characters long"),
  objective: z
    .string()
    .min(10, "Objective must be at least 10 characters long"),
  deliverables: z
    .string()
    .min(10, "Deliverables must be at least 10 characters long"),
  acceptanceCriteria: z
    .string()
    .min(10, "Acceptance criteria must be at least 10 characters long"),
  rewardPoints: z
    .number()
    .int()
    .positive("Reward points must be a positive integer"),
  deadline: z.string().datetime().optional(),
  checklist: z.array(checklistItemSchema).optional()
});

const updateTaskSchema = createTaskSchema.partial().extend({
  freelancerProfileId: z.string().optional(),
  status: taskStatusSchema.optional()
});

const tasksRouter = new Hono();

// GET /tasks - Lấy danh sách tất cả các task
tasksRouter.get("/", async (c) => {
  const allTasks = await db.select().from(tasks);
  let allTasksWithApps = [];
  for (const task of allTasks) {
    const applications = await db
      .select()
      .from(taskApplications)
      .where(eq(taskApplications.taskId, task.id));
    allTasksWithApps.push({ ...task, applications });
  }

  return c.json(allTasksWithApps);
});

// POST /tasks - Tạo một task mới
tasksRouter.post(
  "/",
  authMiddleware,
  zValidator("json", createTaskSchema),
  async (c) => {
    try {
      const data = (c.req as any).valid("json");

      // get verified user payload set by authMiddleware
      const userPayload = (c as any).get("user") as Record<string, any> | undefined;
      const profileIdFromToken = userPayload?.act?.sub || userPayload?.sub;
      if (!profileIdFromToken) return c.json({ error: "Unauthorized" }, 401);

      const { checklist, ...taskData } = data;

      // Generate unique externalTaskId for blockchain escrow mapping
      const externalTaskId = randomUUID();

      const values = {
        ...taskData,
        externalTaskId,
        employerProfileId: profileIdFromToken,
        deadline: taskData.deadline ? new Date(taskData.deadline) : undefined
      } as any;

      const [newTask] = await db.insert(tasks).values(values).returning();

      // Tạo checklist items nếu có
      if (checklist && checklist.length > 0) {
        const checklistValues = checklist.map((item: any, index: number) => ({
          taskId: newTask.id,
          itemText: item.itemText,
          orderIndex: item.orderIndex ?? index
        }));
        await db.insert(taskChecklists).values(checklistValues);
      }

      // [Thông báo #1] Task mới được tạo
      await notifyTaskCreated(newTask.id, newTask.title);

      return c.json(newTask, 201);
    } catch (err: any) {
      console.error("Failed to create task", err);
      return c.json({ error: "Failed to create task" }, 500); 
    }
  }
);

// GET /tasks/:id - Lấy thông tin chi tiết một task theo ID (bao gồm checklist)
tasksRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ error: "Invalid ID" }, 400);
  }
  const task = await db.select().from(tasks).where(eq(tasks.id, id));
  if (task.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }

  // Lấy checklist của task
  const checklist = await db
    .select()
    .from(taskChecklists)
    .where(eq(taskChecklists.taskId, id))
    .orderBy(taskChecklists.orderIndex);

  return c.json({ ...task[0], checklist });
});


//PUT /:id/complete - Cập nhật trạng thái 'completed' cho task + cập nhật điểm thưởng cho freelancer + auto release escrow
// PUT /tasks/:id/resubmit - Freelancer submit lần thứ 2 sau khi được yêu cầu chỉnh sửa
// tasksRouter.put("/resubmit/:id", authMiddleware, async (c) => {
//   const id = c.req.param("id"); 
//   // console.log(`[DEBUG] PUT /tasks/${id}/complete called`);
//   if (!id) return c.json({ error: "Invalid ID" }, 400);

//   const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
//   if (!task) return c.json({ error: "Task not found" }, 404);

//   // Ngăn cộng lại điểm nếu đã completed rồi
//   if (task.status === "completed") {
//     return c.json({ message: "Task already completed", task });
//   }

//   const [updatedTask] = await db
//     .update(tasks)
//     .set({ status: "in_review" })
//     .where(eq(tasks.id, id))
//     .returning();

//   if (!updatedTask) return c.json({ error: "Task not found" }, 404);

//   try {
//     const freelancerId = updatedTask.freelancerProfileId || task.freelancerProfileId;
//     const rewardToAdd = updatedTask.rewardPoints ?? task.rewardPoints ?? 0;

//     if (freelancerId && rewardToAdd > 0) {
//       const [updatedUser] = await db
//         .update(users)
//         .set({ rewardPoints: sql`${users.rewardPoints} + ${rewardToAdd}` })
//         .where(eq(users.profileId, freelancerId))
//         .returning();

//       return c.json({ 
//         message: escrowReleased 
//           ? "Task completed, reward added, and escrow released to freelancer"
//           : "Task completed, reward added (no escrow or already settled)",
//         task: updatedTask, 
//         user: updatedUser,
//         escrowReleased,
//         releaseTxHash
//       });
//     }

//     return c.json({ 
//       message: "Task completed (no reward added)", 
//       task: updatedTask,
//       escrowReleased,
//       releaseTxHash
//     });
//   } catch (err: any) {
//     console.error("Error updating user reward points:", err);
//     return c.json({ 
//       message: "Task completed but failed to update user points", 
//       task: updatedTask,
//       escrowReleased,
//       releaseTxHash
//     });
//   }
// });



// PUT /tasks/:id - Cập nhật một task
tasksRouter.put("/:id", authMiddleware, zValidator("json", updateTaskSchema), async (c) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ error: "Invalid ID" }, 400);
  }
  const data = (c.req as any).valid("json");
  const values = {
    ...data,
    deadline: data.deadline ? new Date(data.deadline) : undefined
  };

  const [updatedTask] = await db
    .update(tasks)
    .set(values)
    .where(eq(tasks.id, id))
    .returning();

  if (!updatedTask) {
    return c.json({ error: "Task not found" }, 404);
  }
  return c.json(updatedTask);
});


  



// PATCH /tasks/:id - Xóa một task (hoặc hủy task)
tasksRouter.patch("/:id", authMiddleware, async (c) => {
  const id = c.req.param("id");
  if (!id) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const userPayload = (c as any).get("user") as Record<string, any> | undefined;
  const profileId = userPayload?.act?.sub || userPayload?.sub;
  if (!profileId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Kiểm tra task có tồn tại và thuộc về user không
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task) {
    return c.json({ error: "Task not found" }, 404);
  }

  if (task.employerProfileId !== profileId) {
    return c.json({ error: "Forbidden: You can only delete your own tasks" }, 403);
  }

  // Kiểm tra xem có application nào không
  const applicationsData = await db
    .select()
    .from(taskApplications)
    .where(eq(taskApplications.taskId, id));

  // đổi status sang 'cancelled'
  const [cancelledTask] = await db
    .update(tasks)
    .set({ status: "cancelled" })
    .where(eq(tasks.id, id))
    .returning();

    applicationsData.forEach(async (application) => {
      await db.update(taskApplications).set({ status: "rejected" }).where(eq(taskApplications.id, application.id));
    });

  return c.json({ 
    message: "Task cancelled successfully (has applications)", 
    task: cancelledTask 
  });
});

// PATCH /tasks/:id/confirm-deposit - Frontend confirms deposit success and links on-chain ID
tasksRouter.patch("/:id/confirm-deposit", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "Invalid task ID" }, 400);
    }

    const body = await c.req.json();
    const { onChainTaskId, depositedTxHash } = body;

    if (!onChainTaskId) {
      return c.json({ error: "Missing onChainTaskId" }, 400);
    }

    // Get verified user payload from authMiddleware
    const userPayload = (c as any).get("user") as Record<string, any> | undefined;
    const profileId = userPayload?.act?.sub || userPayload?.sub;
    if (!profileId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Get task details and verify ownership
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    // Verify caller is the employer
    if (task.employerProfileId !== profileId) {
      return c.json({ 
        error: "Forbidden: Only the task employer can confirm deposit" 
      }, 403);
    }

    console.log(`🔗 Linking Task ${id} with On-chain ID ${onChainTaskId}`);

    // Update DB with on-chain information
    const [updatedTask] = await db
      .update(tasks)
      .set({ 
        onChainTaskId: onChainTaskId.toString(),
        depositedTxHash: depositedTxHash || "confirmed_by_frontend",
        // Note: status should remain as-is until application is accepted
        // Don't change to in_progress here - that happens in accept application flow
      })
      .where(eq(tasks.id, id))
      .returning();

    return c.json({ 
      success: true, 
      message: "Deposit confirmed and linked to task",
      task: updatedTask
    });
  } catch (err: any) {
    console.error("Failed to confirm deposit:", err);
    return c.json({ error: err.message }, 500);
  }
});

// POST /tasks/:id/release - Admin release escrow payment (employer requests, backend executes with admin wallet)
tasksRouter.post("/:id/release", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "Invalid task ID" }, 400);
    }

    // Get verified user payload from authMiddleware
    const userPayload = (c as any).get("user") as Record<string, any> | undefined;
    const profileId = userPayload?.act?.sub || userPayload?.sub;
    if (!profileId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Get task details
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    // Verify caller is the employer
    if (task.employerProfileId !== profileId) {
      return c.json({ 
        error: "Forbidden: Only the task employer can request payment release" 
      }, 403);
    }

    // Check task status - must be in_review (freelancer submitted outcome, waiting for approval)
    if (task.status !== "in_review") {
      return c.json({ 
        error: `Task must be in 'in_review' status to release payment. Current status: ${task.status}`,
        code: "INVALID_STATUS"
      }, 400);
    }

    // Check if deposit exists on-chain
    if (!task.onChainTaskId) {
      return c.json({ 
        error: "No on-chain deposit found for this task. Cannot release payment.",
        code: "NO_DEPOSIT"
      }, 400);
    }

    // Get the application to find freelancer
    // When freelancer submits work, application status changes from "accepted" to "in_review"
    // So we need to check for both statuses
    const applications = await db
      .select()
      .from(taskApplications)
      .where(eq(taskApplications.taskId, id));

    const application = applications.find(app => 
      app.status === "accepted" || app.status === "in_review"
    );

    if (!application) {
      return c.json({ 
        error: "No accepted or in-review application found for this task. Freelancer must be assigned and submit work first.",
        code: "NO_ACCEPTED_APPLICATION"
      }, 404);
    }

    // Get freelancer wallet address
    const [freelancerUser] = await db
      .select()
      .from(users)
      .where(eq(users.profileId, application.applicantProfileId));

    if (!freelancerUser) {
      return c.json({ 
        error: "Freelancer user not found",
        code: "FREELANCER_NOT_FOUND"
      }, 404);
    }

    // Call blockchain service to release escrow using admin wallet
    const reason = "Task completed and approved by employer";
    const receipt = await releaseEscrow(
      task.onChainTaskId,
      freelancerUser.profileId, // Assuming profileId is wallet address
      reason
    );

    // Update task status to completed
    const [updatedTask] = await db
      .update(tasks)
      .set({ status: "completed" })
      .where(eq(tasks.id, id))
      .returning();

    // Update application status to completed
    await db
      .update(taskApplications)
      .set({ 
        status: "completed",
        completedAt: new Date()
      })
      .where(eq(taskApplications.id, application.id));

    // Add reward points to freelancer
    const rewardToAdd = task.rewardPoints ?? 0;
    if (rewardToAdd > 0) {
      await db
        .update(users)
        .set({ rewardPoints: sql`${users.rewardPoints} + ${rewardToAdd}` })
        .where(eq(users.profileId, freelancerUser.profileId));
    }

    return c.json({
      success: true,
      message: "Payment released successfully to freelancer",
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      task: updatedTask
    }, 200);

  } catch (err: any) {
    console.error("Failed to release escrow payment:", err);
    
    // Handle specific blockchain errors
    if (err.message?.includes("not initialized")) {
      return c.json({ 
        error: "Blockchain service not available. Please contact administrator.",
        code: "BLOCKCHAIN_NOT_INITIALIZED"
      }, 503);
    }

    if (err.message?.includes("already settled")) {
      return c.json({ 
        error: "This escrow has already been settled (released or cancelled)",
        code: "ALREADY_SETTLED"
      }, 400);
    }

    return c.json({ 
      error: "Failed to release payment. Please try again later.",
      details: err.message 
    }, 500);
  }
});

export default tasksRouter;
