ALTER TABLE "landing_page_versions" DROP CONSTRAINT "landing_page_versions_session_id_version_number_unique";--> statement-breakpoint
DROP INDEX "session_version_idx";--> statement-breakpoint
ALTER TABLE "landing_page_versions" ADD COLUMN "chat_id" varchar(32);--> statement-breakpoint
-- Backfill chat_id from previous session_id values
UPDATE "landing_page_versions"
SET "chat_id" = substring("session_id" from '^chat-(.*)$')
WHERE "chat_id" IS NULL AND "session_id" LIKE 'chat-%';--> statement-breakpoint
UPDATE "landing_page_versions"
SET "chat_id" = "session_id"
WHERE "chat_id" IS NULL
  AND length("session_id") <= 32
  AND EXISTS (
    SELECT 1 FROM "chats" c WHERE c."public_id" = "landing_page_versions"."session_id"
  );--> statement-breakpoint
UPDATE "landing_page_versions"
SET "chat_id" = substring(md5("session_id"), 1, 32)
WHERE "chat_id" IS NULL;--> statement-breakpoint
-- Ensure referenced chats exist for all backfilled chat_ids (legacy sessions)
INSERT INTO "chats" ("public_id", "user_id", "created_at", "updated_at")
SELECT DISTINCT lp."chat_id", lp."user_id", now(), now()
FROM "landing_page_versions" lp
WHERE NOT EXISTS (
  SELECT 1 FROM "chats" c WHERE c."public_id" = lp."chat_id"
);--> statement-breakpoint
ALTER TABLE "landing_page_versions" ALTER COLUMN "chat_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "landing_page_versions" ADD CONSTRAINT "landing_page_versions_chat_id_chats_public_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("public_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_version_idx" ON "landing_page_versions" USING btree ("chat_id","version_number");--> statement-breakpoint
ALTER TABLE "landing_page_versions" DROP COLUMN "session_id";--> statement-breakpoint
ALTER TABLE "landing_page_versions" ADD CONSTRAINT "landing_page_versions_chat_id_version_number_unique" UNIQUE("chat_id","version_number");