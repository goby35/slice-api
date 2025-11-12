import { Hono } from "hono";
import { eq, desc, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { notifications } from "../db/schema.js";
import authMiddleware from "../middlewares/authMiddleware.js";

const notificationsRouter = new Hono();

// GET /notifications - Lấy danh sách thông báo của user hiện tại
notificationsRouter.get("/", authMiddleware, async (c) => {
  try {
    const userPayload = (c as any).get("user") as Record<string, any> | undefined;
    const profileId = userPayload?.act?.sub || userPayload?.sub;
    
    if (!profileId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userNotifications = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userProfileId, profileId))
      .orderBy(desc(notifications.createdAt));

    return c.json(userNotifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return c.json({ error: "Failed to fetch notifications" }, 500);
  }
});

// GET /notifications/unread - Lấy số lượng thông báo chưa đọc
notificationsRouter.get("/unread", authMiddleware, async (c) => {
  try {
    const userPayload = (c as any).get("user") as Record<string, any> | undefined;
    const profileId = userPayload?.act?.sub || userPayload?.sub;
    
    if (!profileId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const unreadNotifications = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userProfileId, profileId),
          eq(notifications.isRead, 0)
        )
      );

    return c.json({ count: unreadNotifications.length });
  } catch (error) {
    console.error("Error counting unread notifications:", error);
    return c.json({ error: "Failed to count unread notifications" }, 500);
  }
});

// PUT /notifications/:id/read - Đánh dấu thông báo đã đọc
notificationsRouter.put("/:id/read", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "Invalid notification ID" }, 400);
    }

    const userPayload = (c as any).get("user") as Record<string, any> | undefined;
    const profileId = userPayload?.act?.sub || userPayload?.sub;
    
    if (!profileId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Kiểm tra thông báo có thuộc về user này không
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id));

    if (!notification) {
      return c.json({ error: "Notification not found" }, 404);
    }

    if (notification.userProfileId !== profileId) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const [updatedNotification] = await db
      .update(notifications)
      .set({ isRead: 1 })
      .where(eq(notifications.id, id))
      .returning();

    return c.json(updatedNotification);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return c.json({ error: "Failed to mark notification as read" }, 500);
  }
});

// PUT /notifications/read-all - Đánh dấu tất cả thông báo đã đọc
notificationsRouter.put("/read-all", authMiddleware, async (c) => {
  try {
    const userPayload = (c as any).get("user") as Record<string, any> | undefined;
    const profileId = userPayload?.act?.sub || userPayload?.sub;
    
    if (!profileId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await db
      .update(notifications)
      .set({ isRead: 1 })
      .where(
        and(
          eq(notifications.userProfileId, profileId),
          eq(notifications.isRead, 0)
        )
      );

    return c.json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return c.json({ error: "Failed to mark all notifications as read" }, 500);
  }
});

// DELETE /notifications/:id - Xóa thông báo
notificationsRouter.delete("/:id", authMiddleware, async (c) => {
  try {
    const id = c.req.param("id");
    if (!id) {
      return c.json({ error: "Invalid notification ID" }, 400);
    }

    const userPayload = (c as any).get("user") as Record<string, any> | undefined;
    const profileId = userPayload?.act?.sub || userPayload?.sub;
    
    if (!profileId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Kiểm tra thông báo có thuộc về user này không
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id));

    if (!notification) {
      return c.json({ error: "Notification not found" }, 404);
    }

    if (notification.userProfileId !== profileId) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await db.delete(notifications).where(eq(notifications.id, id));

    return c.json({ message: "Notification deleted successfully" });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return c.json({ error: "Failed to delete notification" }, 500);
  }
});

export default notificationsRouter;
