ALTER TABLE "programs" ADD COLUMN "block_duration_weeks" smallint DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "period_duration_months" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD COLUMN "period_number" integer DEFAULT 1 NOT NULL;