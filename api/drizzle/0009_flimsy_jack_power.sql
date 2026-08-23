ALTER TABLE "programs" ADD COLUMN "workout_time" text DEFAULT '18:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "last_reminder_at" timestamp with time zone;