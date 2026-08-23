CREATE TABLE "cardio_options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"gym_id" uuid,
	"name" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "cardio_logs" ADD COLUMN "cardio_option_id" uuid;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "cardio_option_id" uuid;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "cardio_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "templates" ADD COLUMN "cardio_intensity" text;--> statement-breakpoint
CREATE INDEX "cardio_options_owner_rev_idx" ON "cardio_options" USING btree ("owner_id","rev");