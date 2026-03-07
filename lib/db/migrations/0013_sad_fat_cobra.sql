ALTER TABLE "ai_usage_events" ALTER COLUMN "credits_charged" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "ai_usage_events" ALTER COLUMN "credits_refunded" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "credit_action_pricing" ALTER COLUMN "credits_cost" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "credit_debit_allocations" ALTER COLUMN "credits_used" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "credit_grants" ALTER COLUMN "credits_total" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "credit_grants" ALTER COLUMN "credits_remaining" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ALTER COLUMN "credits_delta" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "credit_wallets" ALTER COLUMN "balance_cached" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "included_credits_per_cycle" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "rollover_cap" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "daily_bonus_credits" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "daily_bonus_cap_per_cycle" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "subscription_cycles" ALTER COLUMN "included_credits_granted" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "subscription_cycles" ALTER COLUMN "rollover_credits_granted" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "subscription_cycles" ALTER COLUMN "credits_consumed_in_cycle" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "subscription_cycles" ALTER COLUMN "credits_expired_in_cycle" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "topup_packages" ALTER COLUMN "credits_amount" SET DATA TYPE numeric(10, 2);