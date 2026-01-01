CREATE TABLE "landing_page_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"version_number" integer NOT NULL,
	"code_content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "landing_page_versions_session_id_version_number_unique" UNIQUE("session_id","version_number")
);
--> statement-breakpoint
ALTER TABLE "landing_page_versions" ADD CONSTRAINT "landing_page_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_version_idx" ON "landing_page_versions" USING btree ("session_id","version_number");--> statement-breakpoint
CREATE INDEX "user_id_idx" ON "landing_page_versions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "created_at_idx" ON "landing_page_versions" USING btree ("created_at");