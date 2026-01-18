CREATE TABLE "chat_tool_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" integer NOT NULL,
	"step_number" integer,
	"state" varchar(20) NOT NULL,
	"tool_call_id" varchar(255),
	"tool_name" varchar(255) NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_tool_calls" ADD CONSTRAINT "chat_tool_calls_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_tool_calls_chat_id_idx" ON "chat_tool_calls" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "chat_tool_calls_tool_call_id_idx" ON "chat_tool_calls" USING btree ("tool_call_id");--> statement-breakpoint
CREATE INDEX "chat_tool_calls_created_at_idx" ON "chat_tool_calls" USING btree ("created_at");