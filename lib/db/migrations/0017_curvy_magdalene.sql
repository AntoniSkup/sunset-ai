CREATE TABLE "chat_stream_cursors" (
	"chat_id" integer PRIMARY KEY NOT NULL,
	"last_logical_event_id" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "chat_stream_events_chat_id_id_idx";--> statement-breakpoint
DROP INDEX "chat_stream_events_run_id_id_idx";--> statement-breakpoint
ALTER TABLE "chat_stream_events" ADD COLUMN "logical_event_id" integer;--> statement-breakpoint
ALTER TABLE "chat_stream_cursors" ADD CONSTRAINT "chat_stream_cursors_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
WITH ranked_stream_events AS (
	SELECT
		"id",
		ROW_NUMBER() OVER (PARTITION BY "chat_id" ORDER BY "id")::integer AS "logical_event_id"
	FROM "chat_stream_events"
)
UPDATE "chat_stream_events" AS cse
SET "logical_event_id" = ranked_stream_events."logical_event_id"
FROM ranked_stream_events
WHERE cse."id" = ranked_stream_events."id";--> statement-breakpoint
INSERT INTO "chat_stream_cursors" ("chat_id", "last_logical_event_id", "updated_at")
SELECT
	"chat_id",
	MAX("logical_event_id")::integer,
	now()
FROM "chat_stream_events"
GROUP BY "chat_id"
ON CONFLICT ("chat_id") DO UPDATE
SET
	"last_logical_event_id" = EXCLUDED."last_logical_event_id",
	"updated_at" = EXCLUDED."updated_at";--> statement-breakpoint
ALTER TABLE "chat_stream_events" ALTER COLUMN "logical_event_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_stream_events_chat_id_logical_event_id_idx" ON "chat_stream_events" USING btree ("chat_id","logical_event_id");--> statement-breakpoint
CREATE INDEX "chat_stream_events_run_id_logical_event_id_idx" ON "chat_stream_events" USING btree ("run_id","logical_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_stream_events_chat_id_logical_event_id_unique_idx" ON "chat_stream_events" USING btree ("chat_id","logical_event_id");--> statement-breakpoint