CREATE TABLE "form_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" varchar(32) NOT NULL,
	"published_public_id" varchar(63),
	"mode" varchar(16) NOT NULL,
	"form_name" varchar(64),
	"page_url" text,
	"fields" jsonb NOT NULL,
	"recipient_email" varchar(255) NOT NULL,
	"email_delivery_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"email_delivery_error" text,
	"submitter_ip_hash" varchar(64),
	"user_agent" varchar(512),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "form_notification_email" varchar(255);--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_chat_id_chats_public_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("public_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "form_submissions_chat_id_idx" ON "form_submissions" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "form_submissions_created_at_idx" ON "form_submissions" USING btree ("created_at");
