ALTER TABLE "slice_db"."users" ADD COLUMN "is_warned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "slice_db"."users" ADD COLUMN "is_banned" boolean DEFAULT false NOT NULL;