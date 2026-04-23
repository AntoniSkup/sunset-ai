CREATE TABLE "chat_turn_run_live_state" (
	"run_id" uuid PRIMARY KEY NOT NULL,
	"chat_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"assistant_parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preview_state" jsonb,
	"last_logical_event_id" integer DEFAULT 0 NOT NULL,
	"last_event_created_at" timestamp,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);--> statement-breakpoint
ALTER TABLE "chat_turn_run_live_state" ADD CONSTRAINT "chat_turn_run_live_state_run_id_chat_turn_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."chat_turn_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_turn_run_live_state" ADD CONSTRAINT "chat_turn_run_live_state_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_turn_run_live_state" ADD CONSTRAINT "chat_turn_run_live_state_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_turn_run_live_state_chat_id_idx" ON "chat_turn_run_live_state" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_turn_run_live_state_user_id_idx" ON "chat_turn_run_live_state" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "chat_turn_run_live_state_chat_id_status_idx" ON "chat_turn_run_live_state" USING btree ("chat_id","status");
