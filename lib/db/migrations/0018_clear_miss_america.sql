ALTER TABLE "site_assets" ADD COLUMN "source_type" varchar(20) DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "site_assets" ADD COLUMN "provider" varchar(50);--> statement-breakpoint
ALTER TABLE "site_assets" ADD COLUMN "provider_asset_id" varchar(255);--> statement-breakpoint
ALTER TABLE "site_assets" ADD COLUMN "provider_page_url" text;--> statement-breakpoint
ALTER TABLE "site_assets" ADD COLUMN "search_query" text;--> statement-breakpoint
ALTER TABLE "site_assets" ADD COLUMN "slot_key" varchar(80);--> statement-breakpoint
ALTER TABLE "site_assets" ADD COLUMN "attribution_text" text;--> statement-breakpoint
ALTER TABLE "site_assets" ADD COLUMN "attribution_url" text;--> statement-breakpoint
ALTER TABLE "site_assets" ADD COLUMN "tags" jsonb;