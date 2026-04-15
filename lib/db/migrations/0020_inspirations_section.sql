ALTER TABLE "inspirations" ADD COLUMN "section" varchar(64) DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
CREATE INDEX "inspirations_section_idx" ON "inspirations" USING btree ("section");
