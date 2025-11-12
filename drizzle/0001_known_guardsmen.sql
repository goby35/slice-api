ALTER TABLE "slice_db"."notifications" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "slice_db"."task_applications" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "slice_db"."task_checklists" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "slice_db"."tasks" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();