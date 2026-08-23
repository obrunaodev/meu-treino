CREATE TABLE "whatsapp_group_messages" (
	"owner_id" uuid NOT NULL,
	"remote_jid" text NOT NULL,
	"message_id" text NOT NULL,
	"from_me" boolean NOT NULL,
	"participant" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_group_messages_owner_id_remote_jid_message_id_pk" PRIMARY KEY("owner_id","remote_jid","message_id")
);
--> statement-breakpoint
ALTER TABLE "whatsapp_group_messages" ADD CONSTRAINT "whatsapp_group_messages_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;