CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_user_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"country_code" varchar(2),
	"currency" varchar(3) DEFAULT 'PLN' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"project_id" integer,
	"action_type" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL,
	"credits_charged" integer DEFAULT 0 NOT NULL,
	"credits_refunded" integer DEFAULT 0 NOT NULL,
	"provider" varchar(50),
	"model" varchar(100),
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_tokens" integer,
	"provider_cost_minor" integer,
	"request_id" varchar(255),
	"trace_id" varchar(255),
	"idempotency_key" varchar(255),
	"error_code" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "credit_action_pricing" (
	"id" serial PRIMARY KEY NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"credits_cost" integer NOT NULL,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"effective_to" timestamp,
	"plan_id" integer,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_debit_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"ledger_debit_entry_id" integer NOT NULL,
	"grant_id" integer NOT NULL,
	"credits_used" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"source_type" varchar(30) NOT NULL,
	"source_id" integer,
	"credits_total" integer NOT NULL,
	"credits_remaining" integer NOT NULL,
	"expires_at" timestamp,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"wallet_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"entry_type" varchar(30) NOT NULL,
	"credits_delta" integer NOT NULL,
	"grant_id" integer,
	"usage_event_id" integer,
	"order_id" integer,
	"subscription_cycle_id" integer,
	"idempotency_key" varchar(255),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"balance_cached" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credit_wallets_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"status" varchar(20) NOT NULL,
	"provider" varchar(30) DEFAULT 'stripe' NOT NULL,
	"provider_payment_intent_id" text,
	"provider_invoice_id" text,
	"topup_package_id" integer,
	"amount_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'PLN' NOT NULL,
	"payment_method_type" varchar(30),
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'PLN' NOT NULL,
	"billing_interval" varchar(20) NOT NULL,
	"included_credits_per_cycle" integer NOT NULL,
	"rollover_cap" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"daily_bonus_credits" integer,
	"topups_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subscription_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"status" varchar(20) NOT NULL,
	"included_credits_granted" integer NOT NULL,
	"rollover_credits_granted" integer DEFAULT 0 NOT NULL,
	"credits_consumed_in_cycle" integer DEFAULT 0 NOT NULL,
	"credits_expired_in_cycle" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"status" varchar(30) NOT NULL,
	"provider" varchar(30) DEFAULT 'stripe' NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topup_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"credits_amount" integer NOT NULL,
	"price_minor" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'PLN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "topup_packages_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_action_pricing" ADD CONSTRAINT "credit_action_pricing_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_debit_allocations" ADD CONSTRAINT "credit_debit_allocations_ledger_debit_entry_id_credit_ledger_entries_id_fk" FOREIGN KEY ("ledger_debit_entry_id") REFERENCES "public"."credit_ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_debit_allocations" ADD CONSTRAINT "credit_debit_allocations_grant_id_credit_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."credit_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_wallet_id_credit_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."credit_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_wallet_id_credit_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."credit_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_grant_id_credit_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."credit_grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_usage_event_id_ai_usage_events_id_fk" FOREIGN KEY ("usage_event_id") REFERENCES "public"."ai_usage_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_subscription_cycle_id_subscription_cycles_id_fk" FOREIGN KEY ("subscription_cycle_id") REFERENCES "public"."subscription_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_wallets" ADD CONSTRAINT "credit_wallets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_topup_package_id_topup_packages_id_fk" FOREIGN KEY ("topup_package_id") REFERENCES "public"."topup_packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_cycles" ADD CONSTRAINT "subscription_cycles_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_cycles" ADD CONSTRAINT "subscription_cycles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_events_account_id_idx" ON "ai_usage_events" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "ai_usage_events_user_id_idx" ON "ai_usage_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_usage_events_idempotency_key_idx" ON "ai_usage_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ai_usage_events_created_at_idx" ON "ai_usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "credit_action_pricing_action_type_idx" ON "credit_action_pricing" USING btree ("action_type");--> statement-breakpoint
CREATE INDEX "credit_action_pricing_plan_id_idx" ON "credit_action_pricing" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "credit_debit_allocations_ledger_debit_entry_id_idx" ON "credit_debit_allocations" USING btree ("ledger_debit_entry_id");--> statement-breakpoint
CREATE INDEX "credit_debit_allocations_grant_id_idx" ON "credit_debit_allocations" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "credit_grants_wallet_id_idx" ON "credit_grants" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "credit_grants_account_id_idx" ON "credit_grants" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "credit_grants_expires_at_idx" ON "credit_grants" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "credit_ledger_entries_wallet_id_idx" ON "credit_ledger_entries" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_entries_account_id_idx" ON "credit_ledger_entries" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_entries_idempotency_key_idx" ON "credit_ledger_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "credit_ledger_entries_created_at_idx" ON "credit_ledger_entries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "credit_wallets_account_id_idx" ON "credit_wallets" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "orders_account_id_idx" ON "orders" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "orders_provider_payment_intent_id_idx" ON "orders" USING btree ("provider_payment_intent_id");--> statement-breakpoint
CREATE INDEX "subscription_cycles_subscription_id_idx" ON "subscription_cycles" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_cycles_account_id_idx" ON "subscription_cycles" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "subscription_cycles_period_idx" ON "subscription_cycles" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "subscriptions_account_id_idx" ON "subscriptions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "subscriptions_provider_subscription_id_idx" ON "subscriptions" USING btree ("provider_subscription_id");