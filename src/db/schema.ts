import {
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar
} from "drizzle-orm/pg-core";

// === USERS ===
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  profileId: varchar("profile_id", { length: 255 }).notNull().unique(),
  username: varchar("username", { length: 100 }),
  reputationScore: integer("reputation_score").notNull().default(100),
  rewardPoints: integer("reward_points").notNull().default(0),
  level: integer("level").notNull().default(0),
  professionalRoles: jsonb("professional_roles")
    .$type<string[]>()

    .default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
});

// === TASKS ===
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
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
    .$type<"open" | "assigned" | "in_progress" | "completed" | "cancelled">(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deadline: timestamp("deadline")
});

// === TASK APPLICATIONS ===
export const taskApplications = pgTable("task_applications", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  applicantProfileId: varchar("applicant_profile_id", { length: 255 })
    .notNull()
    .references(() => users.profileId, { onDelete: "cascade" }),
  coverLetter: text("cover_letter"),
  status: varchar("status", { length: 20 })
    .notNull()
    .default("waiting to accept")
    .$type<"waiting to accept" | "accepted" | "rejected">(),
  appliedAt: timestamp("applied_at").notNull().defaultNow()
});
