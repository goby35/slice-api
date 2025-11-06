import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { tasks } from "../db/schema.js";
import authMiddleware from "../middlewares/authMiddleware.js";

// Zod Schemas
const taskStatusSchema = z.enum([
  "open",
  "assigned",
  "in_progress",
  "completed",
  "cancelled"
]);

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
  deadline: z.string().datetime().optional()
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

      const values = {
        ...data,
        employerProfileId: profileIdFromToken,
        deadline: data.deadline ? new Date(data.deadline) : undefined
      } as any;

      const [newTask] = await db.insert(tasks).values(values).returning();
      return c.json(newTask, 201);

      // project file structure: index(runserver + bigest routes) => routes(more specific routes) (using middlewares) => services(db, business logic, utils)
    } catch (err: any) { // exception handling + custom error response
      console.error("Failed to create task", err);
      return c.json({ error: "Failed to create task" }, 500); 
    }
  }
);

// GET /tasks/:id - Lấy thông tin chi tiết một task theo ID
tasksRouter.get("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }
  const task = await db.select().from(tasks).where(eq(tasks.id, id));
  if (task.length === 0) {
    return c.json({ error: "Task not found" }, 404);
  }
  return c.json(task[0]);
});

// PUT /tasks/:id - Cập nhật một task
tasksRouter.put("/:id", zValidator("json", updateTaskSchema), async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) {
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

// DELETE /tasks/:id - Xóa một task
tasksRouter.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid ID" }, 400);
  }

  const [deletedTask] = await db
    .delete(tasks)
    .where(eq(tasks.id, id))
    .returning();

  if (!deletedTask) {
    return c.json({ error: "Task not found" }, 404);
  }

  return c.json({ message: "Task deleted successfully" });
});

export default tasksRouter;
