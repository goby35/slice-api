import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  varchar,
  uuid,
  boolean
} from "drizzle-orm/pg-core";

export const sliceDB = pgSchema("slice_db");

// === USERS ===
export const users = sliceDB.table("users", {
  profileId: varchar("profile_id", { length: 255 }).primaryKey(),
  username: varchar("username", { length: 100 }),
  reputationScore: integer("reputation_score").notNull().default(100),
  rewardPoints: integer("reward_points").notNull().default(0),
  level: integer("level").notNull().default(0),
  professionalRoles: jsonb("professional_roles")
    .$type<string[]>()

    .default([]),
    isWarned: boolean("is_warned").notNull().default(false),
    isBanned: boolean("is_banned").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
});

// === TASKS ===
export const tasks = sliceDB.table("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  externalTaskId: varchar("external_task_id", { length: 255 }).unique(), // UUID for blockchain escrow
  employerProfileId: varchar("employer_profile_id", { length: 255 })
    .notNull()
    .references(() => users.profileId, { onDelete: "cascade" }),
  freelancerProfileId: varchar("freelancer_profile_id", {
    length: 255
  }).references(() => users.profileId, { onDelete: "set null" }),
  title: varchar("title", { length: 255 }).notNull(),
  objective: text("objective").notNull(),
  deliverables: text("deliverables").notNull(),
  acceptanceCriteria: text("acceptance_criteria").notNull(),
  rewardPoints: integer("reward_points").notNull(),
  status: varchar("status", { length: 20 })
    .notNull()
    .default("open")
    .$type<"open" | "in_review" | "in_progress" | "completed" | "cancelled">(),
  depositedTxHash: varchar("deposited_tx_hash", { length: 66 }), // On-chain deposit tx hash
  onChainTaskId: varchar("on_chain_task_id", { length: 100 }), // On-chain taskId from contract
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deadline: timestamp("deadline")
});

// === TASK APPLICATIONS ===
export const taskApplications = sliceDB.table("task_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  applicantProfileId: varchar("applicant_profile_id", { length: 255 })
    .notNull()
    .references(() => users.profileId, { onDelete: "cascade" }),
  coverLetter: text("cover_letter"),
  outcome: text("outcome"), // Text hoặc URL file
  outcomeType: varchar("outcome_type", { length: 20 })
    .$type<"text" | "file">(),
  status: varchar("status", { length: 20 })
    .notNull()
    .default("submitted")
    .$type<"submitted" | "accepted" | "in_review" | "rejected" | "needs_revision" | "completed">(),
  feedback: text("feedback"), // Feedback từ employer khi yêu cầu chỉnh sửa
  rating: integer("rating"), // Đánh giá từ 1-5 sao
  comment: text("comment"), // Comment đánh giá
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at") // Thời điểm hoàn thành
  ,
  // Số lần freelancer submit outcome sau khi được yêu cầu chỉnh sửa
  submissionCount: integer("submission_count").notNull().default(0)
});

// === TASK CHECKLISTS ===
export const taskChecklists = sliceDB.table("task_checklists", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  itemText: text("item_text").notNull(),
  isCompleted: integer("is_completed").notNull().default(0), // 0 = false, 1 = true
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow()
});

// === NOTIFICATIONS ===
export const notifications = sliceDB.table("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userProfileId: varchar("user_profile_id", { length: 255 })
    .notNull()
    .references(() => users.profileId, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 })
    .notNull()
    .$type<
      | "task_created"
      | "application_received"
      | "application_accepted"
      | "application_rejected"
      | "task_submitted"
      | "task_needs_revision"
      | "task_approved"
      | "rating_reminder"
      | "task_rated"
    >(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  relatedTaskId: uuid("related_task_id").references(() => tasks.id, {
    onDelete: "cascade"
  }),
  relatedApplicationId: uuid("related_application_id").references(
    () => taskApplications.id,
    { onDelete: "cascade" }
  ),
  isRead: integer("is_read").notNull().default(0), // 0 = false, 1 = true
  createdAt: timestamp("created_at").notNull().defaultNow()
});

// === ESCROW TASKS (Blockchain) ===
export const escrowTasks = sliceDB.table("escrow_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: varchar("task_id", { length: 100 }).notNull().unique(), // On-chain taskId (starts from 1)
  externalTaskId: varchar("external_task_id", { length: 255 }).notNull().unique(), // UUID mapped to tasks table
  employer: varchar("employer", { length: 255 }).notNull(), // Ethereum address
  freelancer: varchar("freelancer", { length: 255 }).notNull(), // Ethereum address
  amount: varchar("amount", { length: 100 }).notNull(), // BigNumber as string
  deadline: integer("deadline").notNull(), // Unix timestamp
  settled: integer("settled").notNull().default(0), // 0 = false, 1 = true
  depositedTx: varchar("deposited_tx", { length: 255 }).notNull(),
  depositedAt: timestamp("deposited_at").notNull().defaultNow(),
  releasedTx: varchar("released_tx", { length: 255 }),
  releasedAt: timestamp("released_at"),
  releaseTo: varchar("release_to", { length: 255 }), // Address who received funds
  releaseReason: text("release_reason"), // Reason for release
  createdAt: timestamp("created_at").notNull().defaultNow()
});
