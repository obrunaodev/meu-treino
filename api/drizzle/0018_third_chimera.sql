CREATE TABLE "body_measurements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"rev" bigint DEFAULT nextval('sync_rev_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"kind" text NOT NULL,
	"side" text DEFAULT 'ambos' NOT NULL,
	"value" numeric(8, 2) NOT NULL,
	"measured_on" date NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE INDEX "body_measurements_owner_rev_idx" ON "body_measurements" USING btree ("owner_id","rev");