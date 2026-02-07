CREATE TABLE "landing_site_file_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_id" integer NOT NULL,
	"revision_id" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "landing_site_file_versions_file_id_revision_id_unique" UNIQUE("file_id","revision_id")
);
--> statement-breakpoint
CREATE TABLE "landing_site_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" varchar(32) NOT NULL,
	"path" varchar(255) NOT NULL,
	"kind" varchar(20) DEFAULT 'section' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "landing_site_files_chat_id_path_unique" UNIQUE("chat_id","path")
);
--> statement-breakpoint
CREATE TABLE "landing_site_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"chat_id" varchar(32) NOT NULL,
	"user_id" integer NOT NULL,
	"revision_number" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "landing_site_revisions_chat_id_revision_number_unique" UNIQUE("chat_id","revision_number")
);
--> statement-breakpoint
ALTER TABLE "landing_site_file_versions" ADD CONSTRAINT "landing_site_file_versions_file_id_landing_site_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."landing_site_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_site_file_versions" ADD CONSTRAINT "landing_site_file_versions_revision_id_landing_site_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."landing_site_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_site_files" ADD CONSTRAINT "landing_site_files_chat_id_chats_public_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("public_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_site_revisions" ADD CONSTRAINT "landing_site_revisions_chat_id_chats_public_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("public_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landing_site_revisions" ADD CONSTRAINT "landing_site_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "landing_site_file_versions_file_id_idx" ON "landing_site_file_versions" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "landing_site_file_versions_revision_id_idx" ON "landing_site_file_versions" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "landing_site_files_chat_id_idx" ON "landing_site_files" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "landing_site_revisions_chat_revision_idx" ON "landing_site_revisions" USING btree ("chat_id","revision_number");--> statement-breakpoint
CREATE INDEX "landing_site_revisions_user_id_idx" ON "landing_site_revisions" USING btree ("user_id");