import { zValidator } from "@hono/zod-validator";
import { eq, and, ne } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { taskApplications, tasks, users } from "../db/schema.js";
import authMiddleware from "../middlewares/authMiddleware.js";
import {
  notifyApplicationReceived,
  notifyApplicationAccepted,
  notifyApplicationRejected,
  notifyTaskSubmitted,
  notifyTaskNeedsRevision,
  notifyTaskApproved,
  notifyRatingReminder,
  notifyTaskRated,
} from "../services/notificationService.js";
import { updateReputationScore } from "../services/reputationService.js";


// Zod Schemas
const applicationStatusSchema = z.enum([
  "submitted",
  "accepted",
  "rejected",
  "needs_revision",
  "completed"
]);

const createTaskApplicationSchema = z.object({
  taskId: z.string().uuid(),
  coverLetter: z.string().optional()
});

const updateTaskApplicationSchema = z.object({
  status: applicationStatusSchema,
  feedback: z.string().optional(), // Feedback khi yêu cầu chỉnh sửa
  rating: z.number().int().min(1).max(5).optional(), // Đánh giá 1-5 sao
  comment: z.string().optional() // Comment đánh giá
});

const taskApplicationsRouter = new Hono();

// POST /applications/:id/submit - Freelancer submits outcome for an application
taskApplicationsRouter.post(
  "/:id/submit",
  authMiddleware,
  zValidator("json", z.object({ outcome: z.string().optional(), outcomeType: z.enum(["text","file"]).optional() })),
  async (c) => {
    try {
      const id = c.req.param("id");
      if (!id) return c.json({ error: "Invalid Application ID" }, 400);

      const userPayload = (c as any).get("user") as Record<string, any> | undefined;
      const profileId = userPayload?.act?.sub || userPayload?.sub;
      if (!profileId) return c.json({ error: "Unauthorized" }, 401);

      const data = (c.req as any).valid("json");

      // Lấy application
      const [application] = await db
        .select()
        .from(taskApplications)
        .where(eq(taskApplications.id, id));

      if (!application) return c.json({ error: "Application not found" }, 404);

      // Chỉ applicant mới được submit
      if (application.applicantProfileId !== profileId) {
        return c.json({ error: "Forbidden: Only applicant can submit outcome" }, 403);
      }

      // Lấy task
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, application.taskId));

      if (!task) return c.json({ error: "Task not found" }, 404);

      // If application is accepted -> first submission -> set to in_review
  if (application.status === "accepted") {
        const updateFields: any = {
          outcome: data.outcome,
          outcomeType: data.outcomeType,
          status: "in_review"
        };

        const [updatedApplication] = await db
          .update(taskApplications)
          .set(updateFields)
          .where(eq(taskApplications.id, id))
          .returning();

        // Update task status to in_review
        await db
          .update(tasks)
          .set({ status: "in_review" })
          .where(eq(tasks.id, application.taskId));

        // Notify employer that submission arrived and needs review
        const [freelancer] = await db
          .select()
          .from(users)
          .where(eq(users.profileId, profileId));

        await notifyTaskSubmitted(
          task.employerProfileId,
          freelancer?.username || profileId,
          task.title,
          task.id,
          updatedApplication.id
        );

        return c.json({ message: "Submission received and set to in_review", application: updatedApplication }, 200);
      }

      // If application was requested to revise -> this resubmit completes the application
      if (application.status === "needs_revision") {
        const newCount = (application.submissionCount ?? 0) + 1;

        const updateFields: any = {
          outcome: data.outcome,
          outcomeType: data.outcomeType,
          submissionCount: newCount,
          status: "completed",
          completedAt: new Date()
        };

        const [updatedApplication] = await db
          .update(taskApplications)
          .set(updateFields)
          .where(eq(taskApplications.id, id))
          .returning();

        // Update task status to completed
        await db
          .update(tasks)
          .set({ status: "completed", freelancerProfileId: application.applicantProfileId })
          .where(eq(tasks.id, application.taskId));

        // Notifications: submission, approved, rating reminder
        const [freelancer] = await db
          .select()
          .from(users)
          .where(eq(users.profileId, profileId));

        await notifyTaskSubmitted(
          task.employerProfileId,
          freelancer?.username || profileId,
          task.title,
          task.id,
          updatedApplication.id
        );

        await notifyTaskApproved(
          updatedApplication.applicantProfileId,
          task.title,
          task.id,
          updatedApplication.id
        );

        await notifyRatingReminder(
          task.employerProfileId,
          task.title,
          task.id,
          updatedApplication.id
        );

        return c.json({ message: "Resubmission accepted and application completed", application: updatedApplication }, 200);
      }

      return c.json({ error: "Cannot submit outcome in current application status" }, 400);
    } catch (error) {
      console.error("Error submitting application outcome:", error);
      return c.json({ error: "Failed to submit outcome" }, 500);
    }
  }
);

// GET /applications - Lấy tất cả application
taskApplicationsRouter.get("/", async (c) => {
  const applications = await db.select().from(taskApplications);
  return c.json(applications);
});

// GET /applications/task/:taskId - Lấy application theo task ID
taskApplicationsRouter.get("/task/:taskId", async (c) => {
  const taskId = c.req.param("taskId");
  if (!taskId) {
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
  authMiddleware,
  zValidator("json", createTaskApplicationSchema),
  async (c) => {
    try {
      const data = (c.req as any).valid("json");
      const userPayload = (c as any).get("user") as Record<string, any> | undefined;
      const applicantProfileId = userPayload?.act?.sub || userPayload?.sub;
      
      if (!applicantProfileId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Kiểm tra task có tồn tại không
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, data.taskId));

      if (!task) {
        return c.json({ error: "Task not found" }, 404);
      }

      // Kiểm tra đã ứng tuyển chưa
      const existingApplication = await db
        .select()
        .from(taskApplications)
        .where(
          and(
            eq(taskApplications.taskId, data.taskId),
            eq(taskApplications.applicantProfileId, applicantProfileId)
          )
        );

      if (existingApplication.length > 0) {
        return c.json({ error: "You have already applied for this task" }, 400);
      }

      // Tạo application mới
      const [newApplication] = await db
        .insert(taskApplications)
        .values({
          taskId: data.taskId,
          applicantProfileId,
          coverLetter: data.coverLetter
        })
        .returning();

      // Lấy thông tin freelancer
      const [freelancer] = await db
        .select()
        .from(users)
        .where(eq(users.profileId, applicantProfileId));

      // [Thông báo #2] Application mới
      await notifyApplicationReceived(
        task.employerProfileId,
        freelancer?.username || applicantProfileId,
        task.title,
        task.id,
        newApplication.id
      );

      return c.json(newApplication, 201);
    } catch (error) {
      console.error("Error creating application:", error);
      return c.json({ error: "Failed to create application" }, 500);
    }
  }
);

// PUT /applications/:id - Cập nhật trạng thái application (Employer actions)
taskApplicationsRouter.put(
  "/:id",
  authMiddleware,
  zValidator("json", updateTaskApplicationSchema),
  async (c) => {
    try {
      const id = c.req.param("id");
      if (!id) {
        return c.json({ error: "Invalid Application ID" }, 400);
      }

      const userPayload = (c as any).get("user") as Record<string, any> | undefined;
      const profileId = userPayload?.act?.sub || userPayload?.sub;
      if (!profileId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const data = (c.req as any).valid("json");

      // Lấy application và task info
      const [application] = await db
        .select()
        .from(taskApplications)
        .where(eq(taskApplications.id, id));

      if (!application) {
        return c.json({ error: "Application not found" }, 404);
      }

      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, application.taskId));

      if (!task) {
        return c.json({ error: "Task not found" }, 404);
      }

      // Kiểm tra quyền (chỉ employer mới được update)
      if (task.employerProfileId !== profileId) {
        return c.json({ error: "Forbidden: Only task owner can update application" }, 403);
      }

      const updateData: any = { status: data.status };

      // === XỬ LÝ THEO STATUS ===
      
      // [Logic #3a] Yêu cầu chỉnh sửa
      if (data.status === "needs_revision") {
        updateData.feedback = data.feedback || "Please revise your submission";
        
        const [updatedApplication] = await db
          .update(taskApplications)
          .set(updateData)
          .where(eq(taskApplications.id, id))
          .returning();

        // [Thông báo #5] Cần chỉnh sửa
        await notifyTaskNeedsRevision(
          application.applicantProfileId,
          task.title,
          updateData.feedback,
          task.id,
          application.id
        );

        return c.json(updatedApplication);
      }

      // [Logic #3b] Chấp nhận ứng tuyển (bắt đầu làm)
      if (data.status === "accepted") {
        const [updatedApplication] = await db
          .update(taskApplications)
          .set(updateData)
          .where(eq(taskApplications.id, id))
          .returning();

        // Cập nhật trạng thái application của freelancer đã được chấp nhận
        await db
          .update(tasks)
          .set({
            freelancerProfileId: application.applicantProfileId,
            status: "in_progress"
          })
          .where(eq(tasks.id, application.taskId));

        // Cập nhật task status sang 'in_review'
        await db
          .update(tasks)
          .set({ status: "in_review" })
          .where(eq(tasks.id, data.taskId));
        
        // [Thông báo #3] Application được chấp nhận
        await notifyApplicationAccepted(
          application.applicantProfileId,
          task.title,
          task.id,
          application.id
        );
        // Thông báo cho các freelancer khác ứng tuyển bị từ chối
        const otherApplications = await db
          .select()
          .from(taskApplications)
          .where(
            and(
              eq(taskApplications.taskId, task.id),
              // Loại trừ application đã được chấp nhận
              application.applicantProfileId
                ? ne(taskApplications.applicantProfileId, application.applicantProfileId)
                : undefined
            )
          );

        for (const otherApp of otherApplications) {
          await notifyApplicationRejected(
            otherApp.applicantProfileId,
            task.title,
            task.id,
            otherApp.id
          );
          // Tự động từ chối các application khác
          await db
            .update(taskApplications)
            .set({ status: "rejected" })
            .where(eq(taskApplications.id, otherApp.id));
        }
        return c.json(updatedApplication);
      }

      // [Logic #3c] Duyệt hoàn thành + đánh giá ngay
      if (data.status === "completed") {
        updateData.completedAt = new Date();
        if (data.rating) updateData.rating = data.rating;
        if (data.comment) updateData.comment = data.comment;

        const [updatedApplication] = await db
          .update(taskApplications)
          .set(updateData)
          .where(eq(taskApplications.id, id))
          .returning();

        // Cập nhật task status
        await db
          .update(tasks)
          .set({ status: "completed" })
          .where(eq(tasks.id, application.taskId));

        // [Thông báo #6] Task được duyệt
        await notifyTaskApproved(
          application.applicantProfileId,
          task.title,
          task.id,
          application.id
        );

        // [Thông báo #8] Đánh giá (nếu có rating)
        if (data.rating) {
          await notifyTaskRated(
            application.applicantProfileId,
            task.title,
            data.rating,
            task.id,
            application.id
          );
        }

        return c.json(updatedApplication);
      }

      // [Logic] Reject application
      if (data.status === "rejected") {
        const [updatedApplication] = await db
          .update(taskApplications)
          .set(updateData)
          .where(eq(taskApplications.id, id))
          .returning();

        // [Thông báo #9] Application bị từ chối
        await notifyApplicationRejected(
          application.applicantProfileId,
          task.title,
          task.id,
          application.id
        );

        return c.json(updatedApplication);
      }

      return c.json({ error: "Invalid status transition" }, 400);
    } catch (error) {
      console.error("Error updating application:", error);
      return c.json({ error: "Failed to update application" }, 500);
    }
  }
);

// POST /applications/:id/rate - Đánh giá sau khi task đã completed
taskApplicationsRouter.post(
  "/:id/rate",
  authMiddleware,
  zValidator("json", z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().optional()
  })),
  async (c) => {
    try {
      const id = c.req.param("id");
      if (!id) {
        return c.json({ error: "Invalid Application ID" }, 400);
      }

      const userPayload = (c as any).get("user") as Record<string, any> | undefined;
      const profileId = userPayload?.act?.sub || userPayload?.sub;
      if (!profileId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { rating, comment } = (c.req as any).valid("json");

      // Lấy application
      const [application] = await db
        .select()
        .from(taskApplications)
        .where(eq(taskApplications.id, id));

      if (!application) {
        return c.json({ error: "Application not found" }, 404);
      }

      // Lấy task
      const [task] = await db
        .select()
        .from(tasks)
        .where(eq(tasks.id, application.taskId));

      if (!task) {
        return c.json({ error: "Task not found" }, 404);
      }

      // Kiểm tra quyền (chỉ employer)
      if (task.employerProfileId !== profileId) {
        return c.json({ error: "Forbidden: Only task owner can rate" }, 403);
      }

      // Kiểm tra application đã completed chưa
      if (application.status !== "completed") {
        return c.json({ error: "Can only rate completed applications" }, 400);
      }

      // [Logic #5] Đánh giá sau khi tự động duyệt
      const [updatedApplication] = await db
        .update(taskApplications)
        .set({ rating, comment })
        .where(eq(taskApplications.id, id))
        .returning();

      // 2. Tính toán và cập nhật điểm uy tín (reputation)
      // (Đảm bảo 'completedAt' đã được set khi duyệt task)
      await updateReputationScore(
        application.applicantProfileId, // ID của Freelancer
        rating,
        application.completedAt || new Date(), // Thời điểm hoàn thành
        task.deadline // Hạn chót
      );

      // [Thông báo #8] Đánh giá
      await notifyTaskRated(
        application.applicantProfileId,
        task.title,
        rating,
        task.id,
        application.id
      );

      return c.json(updatedApplication);
    } catch (error) {
      console.error("Error rating application:", error);
      return c.json({ error: "Failed to rate application" }, 500);
    }
  }
);

// DELETE /applications/:id - Xóa application
taskApplicationsRouter.delete("/:id", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "Invalid Application ID" }, 400);
    }

    const userPayload = (c as any).get("user") as Record<string, any> | undefined;
    const profileId = userPayload?.act?.sub || userPayload?.sub;
    if (!profileId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Lấy application
    const [application] = await db
      .select()
      .from(taskApplications)
      .where(eq(taskApplications.id, id));

    if (!application) {
      return c.json({ error: "Application not found" }, 404);
    }

    // Chỉ applicant hoặc employer mới được xóa
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, application.taskId));

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    if (
      application.applicantProfileId !== profileId &&
      task.employerProfileId !== profileId
    ) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await db.delete(taskApplications).where(eq(taskApplications.id, id));

    return c.json({ message: "Application deleted successfully" });
  } catch (error) {
    console.error("Error deleting application:", error);
    return c.json({ error: "Failed to delete application" }, 500);
  }
});

export default taskApplicationsRouter;

