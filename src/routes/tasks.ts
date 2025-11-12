import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { tasks, taskChecklists, taskApplications } from "../db/schema.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import { notifyTaskCreated } from "../services/notificationService.js";

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
  return c.json(allTasks);
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

      const values = {
        ...taskData,
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

// PUT /tasks/:id - Cập nhật một task
tasksRouter.put("/:id", zValidator("json", updateTaskSchema), async (c) => {
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

export default tasksRouter;
