ALTER TABLE "whatsapp_group_messages" ADD COLUMN "message_timestamp" bigint;
--> statement-breakpoint
UPDATE "whatsapp_group_messages"
SET "message_timestamp" = extract(epoch from "created_at")::bigint;
--> statement-breakpoint
ALTER TABLE "whatsapp_group_messages" ALTER COLUMN "message_timestamp" SET NOT NULL;
