CREATE TABLE "whatsapp_auth_keys" (
	"owner_id" uuid NOT NULL,
	"category" text NOT NULL,
	"key_id" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "whatsapp_auth_keys_owner_id_category_key_id_pk" PRIMARY KEY("owner_id","category","key_id")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_auth_state" (
	"owner_id" uuid PRIMARY KEY NOT NULL,
	"credentials" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_auth_keys" ADD CONSTRAINT "whatsapp_auth_keys_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_auth_state" ADD CONSTRAINT "whatsapp_auth_state_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;