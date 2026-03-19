CREATE TABLE "site_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" varchar(32) NOT NULL,
	"user_id" integer NOT NULL,
	"alias" varchar(40) NOT NULL,
	"blob_url" text NOT NULL,
	"intent" varchar(20) DEFAULT 'site_asset' NOT NULL,
	"status" varchar(20) DEFAULT 'ready' NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"original_filename" varchar(255),
	"alt_hint" text,
	"label" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_assets_chat_alias_unique" UNIQUE("chat_id","alias")
);
--> statement-breakpoint
ALTER TABLE "site_assets" ADD CONSTRAINT "site_assets_chat_id_chats_public_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("public_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_assets" ADD CONSTRAINT "site_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_assets_chat_id_idx" ON "site_assets" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "site_assets_user_id_idx" ON "site_assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "site_assets_created_at_idx" ON "site_assets" USING btree ("created_at");