CREATE SCHEMA "slice_db";
--> statement-breakpoint
CREATE TABLE "slice_db"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"user_profile_id" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text NOT NULL,
	"related_task_id" uuid,
	"related_application_id" uuid,
	"is_read" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slice_db"."task_applications" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"task_id" uuid NOT NULL,
	"applicant_profile_id" varchar(255) NOT NULL,
	"cover_letter" text,
	"outcome" text,
	"outcome_type" varchar(20),
	"status" varchar(20) DEFAULT 'submitted' NOT NULL,
	"feedback" text,
	"rating" integer,
	"comment" text,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"submission_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slice_db"."task_checklists" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"task_id" uuid NOT NULL,
	"item_text" text NOT NULL,
	"is_completed" integer DEFAULT 0 NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slice_db"."tasks" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"employer_profile_id" varchar(255) NOT NULL,
	"freelancer_profile_id" varchar(255),
	"title" varchar(255) NOT NULL,
	"objective" text NOT NULL,
	"deliverables" text NOT NULL,
	"acceptance_criteria" text NOT NULL,
	"reward_points" integer NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deadline" timestamp
);
--> statement-breakpoint
CREATE TABLE "slice_db"."users" (
	"profile_id" varchar(255) PRIMARY KEY NOT NULL,
	"username" varchar(100),
	"reputation_score" integer DEFAULT 100 NOT NULL,
	"reward_points" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"professional_roles" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slice_db"."notifications" ADD CONSTRAINT "notifications_user_profile_id_users_profile_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "slice_db"."users"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slice_db"."notifications" ADD CONSTRAINT "notifications_related_task_id_tasks_id_fk" FOREIGN KEY ("related_task_id") REFERENCES "slice_db"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slice_db"."notifications" ADD CONSTRAINT "notifications_related_application_id_task_applications_id_fk" FOREIGN KEY ("related_application_id") REFERENCES "slice_db"."task_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slice_db"."task_applications" ADD CONSTRAINT "task_applications_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "slice_db"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slice_db"."task_applications" ADD CONSTRAINT "task_applications_applicant_profile_id_users_profile_id_fk" FOREIGN KEY ("applicant_profile_id") REFERENCES "slice_db"."users"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slice_db"."task_checklists" ADD CONSTRAINT "task_checklists_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "slice_db"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slice_db"."tasks" ADD CONSTRAINT "tasks_employer_profile_id_users_profile_id_fk" FOREIGN KEY ("employer_profile_id") REFERENCES "slice_db"."users"("profile_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slice_db"."tasks" ADD CONSTRAINT "tasks_freelancer_profile_id_users_profile_id_fk" FOREIGN KEY ("freelancer_profile_id") REFERENCES "slice_db"."users"("profile_id") ON DELETE set null ON UPDATE no action;