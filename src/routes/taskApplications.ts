import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { taskApplications } from "../db/schema.js";

// Zod Schemas
const applicationStatusSchema = z.enum(["pending", "accepted", "rejected"]);

const createTaskApplicationSchema = z.object({
  taskId: z.number().int().positive(),
  applicantProfileId: z.string().min(1),
  coverLetter: z.string().optional()
});

const updateTaskApplicationSchema = z.object({
  status: applicationStatusSchema
});

const taskApplicationsRouter = new Hono();

// GET /applications - Lấy tất cả application
taskApplicationsRouter.get("/", async (c) => {
  const applications = await db.select().from(taskApplications);
  return c.json(applications);
});

// GET /applications/task/:taskId - Lấy application theo task ID
taskApplicationsRouter.get("/task/:taskId", async (c) => {
  const taskId = parseInt(c.req.param("taskId"), 10);
  if (Number.isNaN(taskId)) {
    return c.json({ error: "Invalid Task ID" }, 400);
  }
  const applications = await db
    .select()
    .from(taskApplications)
    .where(eq(taskApplications.taskId, taskId));
  return c.json(applications);
});

// POST /applications - Tạo application mới
taskApplicationsRouter.post(
  "/",
  zValidator("json", createTaskApplicationSchema),
  async (c) => {
    const data = (c.req as any).valid("json");
    const [newApplication] = await db
      .insert(taskApplications)
      .values(data)
      .returning();
    return c.json(newApplication, 201);
  }
);

// PUT /applications/:id - Cập nhật trạng thái application
taskApplicationsRouter.put(
  "/:id",
  zValidator("json", updateTaskApplicationSchema),
  async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (Number.isNaN(id)) {
      return c.json({ error: "Invalid Application ID" }, 400);
    }
    const { status } = (c.req as any).valid("json");

    const [updatedApplication] = await db
      .update(taskApplications)
      .set({ status })
      .where(eq(taskApplications.id, id))
      .returning();

    if (!updatedApplication) {
      return c.json({ error: "Application not found" }, 404);
    }

    return c.json(updatedApplication);
  }
);

// DELETE /applications/:id - Xóa application
taskApplicationsRouter.delete("/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (Number.isNaN(id)) {
    return c.json({ error: "Invalid Application ID" }, 400);
  }

  const [deletedApplication] = await db
    .delete(taskApplications)
    .where(eq(taskApplications.id, id))
    .returning();

  if (!deletedApplication) {
    return c.json({ error: "Application not found" }, 404);
  }

  return c.json({ message: "Application deleted successfully" });
});

export default taskApplicationsRouter;
