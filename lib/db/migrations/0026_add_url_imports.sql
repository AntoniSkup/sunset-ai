CREATE TABLE "url_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" varchar(32) NOT NULL,
	"user_id" integer NOT NULL,
	"url_hash" varchar(64) NOT NULL,
	"url" text NOT NULL,
	"final_url" text,
	"mode" varchar(16) NOT NULL,
	"title" varchar(512),
	"description" text,
	"summary" jsonb NOT NULL,
	"screenshot_blob_url" text,
	"provider" varchar(32) DEFAULT 'firecrawl' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "url_imports_chat_url_mode_unique" UNIQUE("chat_id","url_hash","mode")
);
--> statement-breakpoint
ALTER TABLE "url_imports" ADD CONSTRAINT "url_imports_chat_id_chats_public_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("public_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "url_imports" ADD CONSTRAINT "url_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "url_imports_chat_id_idx" ON "url_imports" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "url_imports_created_at_idx" ON "url_imports" USING btree ("created_at");
