CREATE TABLE IF NOT EXISTS "chat_stream_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "chat_id" integer NOT NULL,
  "run_id" uuid NOT NULL,
  "event_type" varchar(40) NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "chat_stream_events"
  ADD CONSTRAINT "chat_stream_events_chat_id_chats_id_fk"
  FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "chat_stream_events"
  ADD CONSTRAINT "chat_stream_events_run_id_chat_turn_runs_id_fk"
  FOREIGN KEY ("run_id") REFERENCES "public"."chat_turn_runs"("id")
  ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "chat_turn_runs"
  ADD COLUMN IF NOT EXISTS "payload" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_stream_events_chat_id_id_idx"
  ON "chat_stream_events" USING btree ("chat_id","id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_stream_events_run_id_id_idx"
  ON "chat_stream_events" USING btree ("run_id","id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_turn_runs_chat_id_status_idx"
  ON "chat_turn_runs" USING btree ("chat_id","status");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "chat_turn_runs_chat_id_sequence_idx"
  ON "chat_turn_runs" USING btree ("chat_id","sequence");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "chat_turn_runs_one_running_per_chat"
  ON "chat_turn_runs" USING btree ("chat_id")
  WHERE "chat_turn_runs"."status" = 'running';