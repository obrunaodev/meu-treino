CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_hash" text NOT NULL,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_refresh_token_hash_unique" UNIQUE("refresh_token_hash")
);
--> statement-breakpoint
CREATE TABLE "cardio_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"session_id" uuid NOT NULL,
	"modality" text,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"perceived_intensity" text,
	"distance_km" numeric(6, 2),
	"avg_heart_rate" smallint,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "catalog_exercises" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"name_i18n" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"group_id" integer,
	"station_code" text,
	"level" text,
	"laterality" text,
	"grip" text,
	"description" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"video" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"load_type" text,
	"load_inferred" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_groups" (
	"id" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"region" text
);
--> statement-breakpoint
CREATE TABLE "catalog_pain_swaps" (
	"exercise_id" integer NOT NULL,
	"pain_slug" text NOT NULL,
	"substitute_id" integer,
	"source" text DEFAULT 'academia' NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"note" text,
	CONSTRAINT "catalog_pain_swaps_exercise_id_pain_slug_pk" PRIMARY KEY("exercise_id","pain_slug")
);
--> statement-breakpoint
CREATE TABLE "catalog_related" (
	"exercise_id" integer NOT NULL,
	"related_id" integer NOT NULL,
	CONSTRAINT "catalog_related_exercise_id_related_id_pk" PRIMARY KEY("exercise_id","related_id")
);
--> statement-breakpoint
CREATE TABLE "catalog_stations" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"load_type" text
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"gym_id" uuid,
	"catalog_station_code" text,
	"name" text NOT NULL,
	"load_type" text DEFAULT 'pino' NOT NULL,
	"increment_kg" numeric(6, 2),
	"plate_table" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "exercise_media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"exercise_id" uuid NOT NULL,
	"s3_key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"position" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_substitutions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"exercise_id" uuid NOT NULL,
	"substitute_exercise_id" uuid NOT NULL,
	"reason" text DEFAULT 'equipamento' NOT NULL,
	"pain_region" text
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"catalog_exercise_id" integer,
	"equipment_id" uuid,
	"name" text NOT NULL,
	"laterality" text DEFAULT 'bilateral' NOT NULL,
	"unilateral_asymmetric" boolean DEFAULT false NOT NULL,
	"cues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "functional_tests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"frequency_days" integer DEFAULT 14 NOT NULL,
	"higher_is_better" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gyms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pain_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"session_id" uuid,
	"set_log_id" uuid,
	"region_slug" text NOT NULL,
	"level" smallint NOT NULL,
	"note" text,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pain_regions" (
	"slug" text PRIMARY KEY NOT NULL,
	"name_pt" text NOT NULL,
	"name_en" text NOT NULL,
	"side" text,
	"catalog_slug" text
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"name" text NOT NULL,
	"schedule_mode" text DEFAULT 'continuous' NOT NULL,
	"sessions_per_cycle" smallint DEFAULT 2 NOT NULL,
	"cycles_per_block" smallint DEFAULT 4 NOT NULL,
	"rir_delta_per_block" smallint DEFAULT -1 NOT NULL,
	"default_rest_seconds" integer DEFAULT 90 NOT NULL,
	"reminder_lead_minutes" integer DEFAULT 60 NOT NULL,
	"weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"started_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"session_id" uuid NOT NULL,
	"template_item_id" uuid,
	"exercise_id" uuid NOT NULL,
	"set_index" smallint NOT NULL,
	"is_warmup" boolean DEFAULT false NOT NULL,
	"side" text DEFAULT 'ambos' NOT NULL,
	"weight_kg" numeric(7, 2),
	"plate_count" smallint,
	"reps" smallint,
	"seconds" integer,
	"rir" smallint,
	"skipped" boolean DEFAULT false NOT NULL,
	"had_pain" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"base_row" jsonb,
	"local_row" jsonb NOT NULL,
	"remote_row" jsonb NOT NULL,
	"conflicting_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sync_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"label" text,
	"last_rev" bigint DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"op" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"template_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"exercise_id" uuid NOT NULL,
	"sets" smallint DEFAULT 3 NOT NULL,
	"rep_min" smallint,
	"rep_max" smallint,
	"is_time_based" boolean DEFAULT false NOT NULL,
	"rir_target" smallint,
	"rest_seconds" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"program_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"name" text NOT NULL,
	"focus" text
);
--> statement-breakpoint
CREATE TABLE "test_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"test_id" uuid NOT NULL,
	"value" numeric(8, 2) NOT NULL,
	"side" text DEFAULT 'ambos' NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"unit" text DEFAULT 'kg' NOT NULL,
	"show_plates" boolean DEFAULT true NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"locale" text DEFAULT 'pt-BR' NOT NULL,
	"reminders_enabled" boolean DEFAULT false NOT NULL,
	"onboarded_at" timestamp with time zone,
	CONSTRAINT "user_settings_owner_uniq" UNIQUE("owner_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_sub" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"picture_url" text,
	"locale" text DEFAULT 'pt-BR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"program_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"cycle_number" integer DEFAULT 1 NOT NULL,
	"block_number" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'em_andamento' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"auto_closed_at" timestamp with time zone,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_exercises" ADD CONSTRAINT "catalog_exercises_group_id_catalog_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."catalog_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_exercises" ADD CONSTRAINT "catalog_exercises_station_code_catalog_stations_code_fk" FOREIGN KEY ("station_code") REFERENCES "public"."catalog_stations"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_pain_swaps" ADD CONSTRAINT "catalog_pain_swaps_exercise_id_catalog_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."catalog_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_pain_swaps" ADD CONSTRAINT "catalog_pain_swaps_substitute_id_catalog_exercises_id_fk" FOREIGN KEY ("substitute_id") REFERENCES "public"."catalog_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_related" ADD CONSTRAINT "catalog_related_exercise_id_catalog_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."catalog_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_related" ADD CONSTRAINT "catalog_related_related_id_catalog_exercises_id_fk" FOREIGN KEY ("related_id") REFERENCES "public"."catalog_exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_devices" ADD CONSTRAINT "sync_devices_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cardio_logs_owner_rev_idx" ON "cardio_logs" USING btree ("owner_id","rev");--> statement-breakpoint
CREATE INDEX "catalog_exercises_group_idx" ON "catalog_exercises" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "equipment_owner_rev_idx" ON "equipment" USING btree ("owner_id","rev");--> statement-breakpoint
CREATE INDEX "exercise_media_owner_rev_idx" ON "exercise_media" USING btree ("owner_id","rev");--> statement-breakpoint
CREATE INDEX "exercise_subs_owner_rev_idx" ON "exercise_substitutions" USING btree ("owner_id","rev");--> statement-breakpoint
CREATE INDEX "exercises_owner_rev_idx" ON "exercises" USING btree ("owner_id","rev");--> statement-breakpoint
CREATE INDEX "functional_tests_owner_rev_idx" ON "functional_tests" USING btree ("owner_id","rev");--> statement-breakpoint
CREATE INDEX "gyms_owner_rev_idx" ON "gyms" USING btree ("owner_id","rev");--> statement-breakpoint
CREATE INDEX "pain_events_owner_rev_idx" ON "pain_events" USING btree ("owner_id","rev");--> statement-breakpoint
CREATE INDEX "programs_owner_rev_idx" ON "programs" USING btree ("owner_id","rev");--> statement-breakpoint
CREATE INDEX "set_logs_owner_rev_idx" ON "set_logs" USING btree ("owner_id","rev");--> statement-breakpoint
CREATE INDEX "set_logs_session_idx" ON "set_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "set_logs_exercise_idx" ON "set_logs" USING btree ("exercise_id","completed_at");--> statement-breakpoint
CREATE INDEX "sync_conflicts_pending_idx" ON "sync_conflicts" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "sync_operations_owner_idx" ON "sync_operations" USING btree ("owner_id","applied_at");--> statement-breakpoint
CREATE INDEX "template_items_owner_rev_idx" ON "template_items" USING btree ("owner_id","rev");--> statement-breakpoint
CREATE INDEX "templates_owner_rev_idx" ON "templates" USING btree ("owner_id","rev");--> statement-breakpoint
CREATE INDEX "test_results_owner_rev_idx" ON "test_results" USING btree ("owner_id","rev");--> statement-breakpoint
CREATE INDEX "sessions_owner_rev_idx" ON "workout_sessions" USING btree ("owner_id","rev");