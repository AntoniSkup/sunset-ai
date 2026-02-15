ALTER TABLE "chats" ADD COLUMN "public_id" varchar(32);--> statement-breakpoint
UPDATE "chats"
SET "public_id" = 'chat_' || substring(md5("id"::text || "created_at"::text), 1, 27)
WHERE "public_id" IS NULL;--> statement-breakpoint
ALTER TABLE "chats" ALTER COLUMN "public_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_public_id_unique" UNIQUE("public_id");