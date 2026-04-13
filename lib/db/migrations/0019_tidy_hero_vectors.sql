CREATE TABLE "inspirations" (
	"id" serial PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "inspirations" ADD CONSTRAINT "inspirations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspirations_created_by_user_id_idx" ON "inspirations" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "inspirations_created_at_idx" ON "inspirations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "inspirations_tags_gin_idx" ON "inspirations" USING gin ("tags");
