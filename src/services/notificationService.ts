import { db } from "../db/index.js";
import { notifications, users, tasks } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from 'uuid';

type NotificationType =
  | "task_created"
  | "application_received"
  | "application_accepted"
  | "application_rejected"
  | "task_submitted"
  | "task_needs_revision"
  | "task_approved"
  | "rating_reminder"
  | "task_rated";

interface CreateNotificationParams {
  userProfileId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedTaskId?: string;
  relatedApplicationId?: string;
}

/**
 * Tạo notification mới
 */
export async function createNotification(params: CreateNotificationParams) {
  try {
    const [notification] = await db
      .insert(notifications)
      .values({
        userProfileId: params.userProfileId,
        type: params.type,
        title: params.title,
        message: params.message,
        relatedTaskId: params.relatedTaskId,
        relatedApplicationId: params.relatedApplicationId
      })
      .returning();
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    throw error;
  }
}

/**
 * [Thông báo #1] Task mới được tạo → gửi đến Public/Group
 * (Hiện tại chỉ log, có thể mở rộng để broadcast)
 */
export async function notifyTaskCreated(taskId: string, taskTitle: string) {
  console.log(`[NOTIFICATION] task_created: ${taskTitle} (ID: ${taskId})`);
  // TODO: Implement broadcast to public/group
  // Có thể gửi đến WebSocket, Push Notification, hoặc lưu vào bảng public_feed
}

/**
 * [Thông báo #2] Application mới → gửi đến Employer
 */
export async function notifyApplicationReceived(
  employerProfileId: string,
  freelancerName: string,
  taskTitle: string,
  taskId: string,
  applicationId: string
) {
  return createNotification({
    userProfileId: employerProfileId,
    type: "application_received",
    title: "Ứng tuyển mới",
    message: `${freelancerName} đã ứng tuyển công việc: ${taskTitle}`,
    relatedTaskId: taskId,
    relatedApplicationId: applicationId
  });
}

/**
 * [Thông báo #3] Application được chấp nhận → gửi đến Freelancer
 */
export async function notifyApplicationAccepted(
  freelancerProfileId: string,
  taskTitle: string,
  taskId: string,
  applicationId: string
) {
  return createNotification({
    userProfileId: freelancerProfileId,
    type: "application_accepted",
    title: "Bạn được chọn!",
    message: `Bạn đã được chọn cho công việc: ${taskTitle}`,
    relatedTaskId: taskId,
    relatedApplicationId: applicationId
  });
}

/**
 * [Thông báo #4] Freelancer submit lại → gửi đến Employer
 */
export async function notifyTaskSubmitted(
  employerProfileId: string,
  freelancerName: string,
  taskTitle: string,
  taskId: string,
  applicationId: string
) {
  return createNotification({
    userProfileId: employerProfileId,
    type: "task_submitted",
    title: "Công việc đã được nộp",
    message: `${freelancerName} đã nộp lại công việc: ${taskTitle}`,
    relatedTaskId: taskId,
    relatedApplicationId: applicationId
  });
}

/**
 * [Thông báo #5] Employer yêu cầu chỉnh sửa → gửi đến Freelancer
 */
export async function notifyTaskNeedsRevision(
  freelancerProfileId: string,
  taskTitle: string,
  feedback: string,
  taskId: string,
  applicationId: string
) {
  return createNotification({
    userProfileId: freelancerProfileId,
    type: "task_needs_revision",
    title: "Cần chỉnh sửa",
    message: `Công việc "${taskTitle}" cần chỉnh sửa: ${feedback}`,
    relatedTaskId: taskId,
    relatedApplicationId: applicationId
  });
}

/**
 * [Thông báo #6] Task được duyệt → gửi đến Freelancer
 */
export async function notifyTaskApproved(
  freelancerProfileId: string,
  taskTitle: string,
  taskId: string,
  applicationId: string
) {
  return createNotification({
    userProfileId: freelancerProfileId,
    type: "task_approved",
    title: "Công việc được duyệt!",
    message: `Công việc "${taskTitle}" đã được duyệt hoàn thành`,
    relatedTaskId: taskId,
    relatedApplicationId: applicationId
  });
}

/**
 * [Thông báo #7] Nhắc nhở đánh giá → gửi đến Employer
 */
export async function notifyRatingReminder(
  employerProfileId: string,
  taskTitle: string,
  taskId: string,
  applicationId: string
) {
  return createNotification({
    userProfileId: employerProfileId,
    type: "rating_reminder",
    title: "Nhắc nhở đánh giá",
    message: `Vui lòng đánh giá người làm cho công việc: ${taskTitle}`,
    relatedTaskId: taskId,
    relatedApplicationId: applicationId
  });
}

/**
 * [Thông báo #8] Freelancer được đánh giá → gửi đến Freelancer
 */
export async function notifyTaskRated(
  freelancerProfileId: string,
  taskTitle: string,
  rating: number,
  taskId: string,
  applicationId: string
) {
  return createNotification({
    userProfileId: freelancerProfileId,
    type: "task_rated",
    title: "Bạn đã được đánh giá",
    message: `Bạn nhận được ${rating} sao cho công việc: ${taskTitle}`,
    relatedTaskId: taskId,
    relatedApplicationId: applicationId
  });
}

/**
 * [Thông báo #9] Application bị từ chối → gửi đến Freelancer
 */
export async function notifyApplicationRejected(
  freelancerProfileId: string,
  taskTitle: string,
  taskId: string,
  applicationId: string
) {
  return createNotification({
    userProfileId: freelancerProfileId,
    type: "application_rejected",
    title: "Ứng tuyển không thành công",
    message: `Rất tiếc, ứng tuyển của bạn cho công việc "${taskTitle}" không được chấp nhận`,
    relatedTaskId: taskId,
    relatedApplicationId: applicationId
  });
}
