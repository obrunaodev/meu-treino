CREATE TABLE "preset_item_alternatives" (
	"preset_item_id" uuid NOT NULL,
	"catalog_exercise_id" integer NOT NULL,
	"priority" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "preset_item_alternatives_preset_item_id_catalog_exercise_id_pk" PRIMARY KEY("preset_item_id","catalog_exercise_id")
);
--> statement-breakpoint
CREATE TABLE "preset_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workout_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"catalog_exercise_id" integer NOT NULL,
	"sets" smallint NOT NULL,
	"rep_min" smallint NOT NULL,
	"rep_max" smallint NOT NULL,
	"rir_target" smallint NOT NULL,
	"rest_seconds" integer NOT NULL,
	"tracking_mode" text DEFAULT 'compact' NOT NULL,
	"load_per_side" boolean DEFAULT false NOT NULL,
	"notes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "preset_items_position_uniq" UNIQUE("workout_id","position")
);
--> statement-breakpoint
CREATE TABLE "preset_workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"preset_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"name" jsonb NOT NULL,
	"focus" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "preset_workouts_position_uniq" UNIQUE("preset_id","position")
);
--> statement-breakpoint
CREATE TABLE "training_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"split" text NOT NULL,
	"focus" text NOT NULL,
	"duration_minutes" smallint NOT NULL,
	"level" text DEFAULT 'beginner' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_presets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "source_preset_slug" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "source_preset_version" integer;--> statement-breakpoint
ALTER TABLE "preset_item_alternatives" ADD CONSTRAINT "preset_item_alternatives_preset_item_id_preset_items_id_fk" FOREIGN KEY ("preset_item_id") REFERENCES "public"."preset_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preset_item_alternatives" ADD CONSTRAINT "preset_item_alternatives_catalog_exercise_id_catalog_exercises_id_fk" FOREIGN KEY ("catalog_exercise_id") REFERENCES "public"."catalog_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preset_items" ADD CONSTRAINT "preset_items_workout_id_preset_workouts_id_fk" FOREIGN KEY ("workout_id") REFERENCES "public"."preset_workouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preset_items" ADD CONSTRAINT "preset_items_catalog_exercise_id_catalog_exercises_id_fk" FOREIGN KEY ("catalog_exercise_id") REFERENCES "public"."catalog_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preset_workouts" ADD CONSTRAINT "preset_workouts_preset_id_training_presets_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."training_presets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_presets_discovery_idx" ON "training_presets" USING btree ("level","split","focus","duration_minutes");