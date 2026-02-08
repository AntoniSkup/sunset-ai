CREATE TABLE "published_sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" varchar(32) NOT NULL,
	"chat_id" varchar(32) NOT NULL,
	"user_id" integer NOT NULL,
	"revision_number" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "published_sites_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "published_sites" ADD CONSTRAINT "published_sites_chat_id_chats_public_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("public_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_sites" ADD CONSTRAINT "published_sites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "published_sites_chat_id_idx" ON "published_sites" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "published_sites_user_id_idx" ON "published_sites" USING btree ("user_id");