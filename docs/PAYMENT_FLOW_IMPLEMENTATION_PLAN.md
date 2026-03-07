# Payment Flow Implementation Plan

**Goals:** Maintainability, scalability, security, minimal implementation.  
**Context:** Existing Stripe instance, pricing page, and team-based checkout; new ledger-based schema (accounts, subscriptions, credits).  
**MVP scope:** 1 subscription tier (Starter) + top-ups + AI credits; rollover and FEFO debit as specified.

---

## 1. Current State vs Target

| Area | Current | Target |
|------|--------|--------|
| Billing entity | `teams` (Stripe IDs on team) | `accounts` (owner = user; one account per user for MVP) |
| Subscription state | `teams.stripe*`, `planName`, `subscriptionStatus` | `subscriptions` + `subscription_cycles` |
| Credits | None | `credit_wallets` + `credit_grants` + `credit_ledger_entries` |
| Checkout | Team → Stripe Checkout (subscription) → callback updates team | Account → Stripe Checkout → webhook + callback update `subscriptions` / create cycles & grants |
| Webhook | Updates team only | Updates `subscriptions`; creates cycles/grants; supports top-up `payment_intent.succeeded` |

**Migration strategy:** Implement new flow on **accounts**; keep **teams** and existing team Stripe fields unchanged for now. Optionally backfill one account per team later and migrate Stripe linkage in a follow-up.

---

## 2. Account Resolution (MVP)

- **One account per user.** No `account_id` on teams for MVP.
- **Resolve account:** `getOrCreateAccountForUser(userId)` → by `owner_user_id`; create if missing (name from user, currency/country defaults).
- **Stripe customer:** Stored on `subscriptions.provider_customer_id`. For first checkout (no subscription yet), create Stripe customer in checkout flow and pass in session; on success create `subscriptions` row with that `provider_customer_id`. No need to add `stripe_customer_id` to `accounts` if we always have a subscription row after first successful checkout; for **customer portal** we get customer from the active subscription. For **creating** checkout when user has no subscription, Stripe can create the customer (no `customer` in session) or we create customer server-side before session and store in subscription when we create it—simplest is let Stripe create customer and persist in subscription on success.

---

## 3. Plan / Stripe Mapping

- **Single plan in DB:** One row in `plans` (e.g. `code: 'starter'`, 200 credits/cycle, rollover cap 100, PLN).
- **Stripe:** One Stripe Product + recurring Price for Starter (or reuse existing “Base” product for MVP). Store **Stripe Price ID** in env (e.g. `STRIPE_STARTER_PRICE_ID`) or add optional `stripe_price_id` to `plans` for clarity.
- **Pricing page:** Can still list plans from DB and pass Stripe Price ID for checkout (from env or `plans`).

---

## 4. Implementation Phases

### Phase A: Foundation (no UI change yet)

1. **Account + wallet lifecycle**
   - Add `getOrCreateAccountForUser(userId)` in `lib/db/queries.ts` (or a dedicated `lib/billing/accounts.ts`).
   - On first account creation, create **credit_wallets** row (balance_cached = 0).
   - Optionally: create account + wallet in a single transaction when user signs up or on first billing action.

2. **Plans + Stripe price config**
   - Seed or migration: insert one `plans` row (Starter) and optionally `credit_action_pricing` rows for known action types.
   - Document env: `STRIPE_STARTER_PRICE_ID` (and later top-up product/price if needed).

3. **Queries**
   - `getAccountForUser(userId)` (and get-or-create variant).
   - `getSubscriptionByAccountId(accountId)`, `getAccountByStripeCustomerId(customerId)` (via subscription).
   - `getWalletByAccountId(accountId)`.

### Phase B: Subscription checkout (account-based)

4. **Checkout session (subscription)**
   - In `lib/payments/stripe.ts`: switch to account-based API:
     - Resolve user → `getOrCreateAccountForUser(user.id)`.
     - If no subscription yet: do **not** pass `customer` (Stripe creates customer); or create Stripe customer, then pass `customer` and store it when creating subscription on success.
     - Use `STRIPE_STARTER_PRICE_ID` (or from plan) for `line_items[].price`.
     - Keep `client_reference_id` = user id (or account id) for success callback.
     - Success URL unchanged; cancel URL unchanged.

5. **Checkout success callback**
   - In `app/api/stripe/checkout/route.ts`:
     - Retrieve session (expand subscription); get Stripe customer id and subscription id.
     - Resolve user from `client_reference_id`; get or create **account**; ensure **credit_wallet** exists.
     - Upsert **subscriptions** (account_id, plan_id from DB plan, status, provider_customer_id, provider_subscription_id, current_period_start/end from Stripe).
     - Create first **subscription_cycles** row (period from Stripe, status `open`, included_credits_granted from plan).
     - Create **credit_grants** (source_type `subscription_cycle`, source_id = cycle id, credits = included_credits_per_cycle, expires_at = period_end).
     - Append **credit_ledger_entries** (grant entry); update **credit_wallets.balance_cached**.
     - Redirect to dashboard (no team update).

6. **Webhook**
   - In `app/api/stripe/webhook/route.ts`:
     - `customer.subscription.updated` / `customer.subscription.deleted`: identify account by subscription’s customer_id (query subscription by `provider_customer_id` or by `provider_subscription_id`). Update **subscriptions** (status, current_period_start/end, cancel_at_period_end, canceled_at). If new period started (e.g. from `updated`), create new **subscription_cycles** and **credit_grants** (included credits, expires_at = period_end).
     - Do **not** update `teams` in this flow (keep legacy team fields for backward compatibility until you migrate).

7. **Customer portal**
   - Resolve account for user → get active subscription → use `subscriptions.provider_customer_id` to create portal session (same Stripe API as today). Keep return URL to dashboard.

8. **Auth/actions**
   - Add `withAccount` (or reuse “get account for current user”) in middleware/actions so billing actions use account instead of team. Pricing page checkout action: resolve account, call new checkout session with account (and user for client_reference_id).

### Phase C: Credits (debit + rollover)

9. **Debit flow (FEFO, atomic)**
   - New module e.g. `lib/credits/debit.ts`:
     - Input: account_id, amount, idempotency_key, usage_event_id (optional), metadata.
     - In a transaction: lock wallet and eligible grants (FEFO: order by expires_at ASC NULLS LAST), deduct from one or more grants, insert **credit_ledger_entries** (debit), **credit_debit_allocations**, update **credit_wallets.balance_cached**. Idempotency: if idempotency_key exists for this wallet/account, return existing result (no double debit).
   - Call this from AI action handler after creating **ai_usage_events** row (pending), then run AI; on failure optionally refund (refund ledger + restore grant balances).

10. **AI usage event**
    - When an AI action runs: create **ai_usage_events** (pending), get credits cost from **credit_action_pricing** (or default), call debit flow, then run model; on success update event (succeeded, credits_charged, tokens); on failure update event and optionally refund.

11. **Rollover (cycle close)**
    - Job (cron or internal endpoint): find **subscription_cycles** with status `open` and `period_end < now()`. For each: compute unused included credits (included_credits_granted - credits_consumed_in_cycle), rollover_amount = min(unused, rollover_cap). Create new **credit_grants** (source_type rollover, expires_at = next cycle end). Ledger entries for grant + expire as needed. Update cycle (status `closed`, credits_expired_in_cycle, closed_at). Next cycle may already exist from webhook; if not, create it when subscription renews.

### Phase D: Top-ups

12. **Top-up packages**
    - Seed or admin: insert **topup_packages** (e.g. 50/150/400 credits, PLN). Optionally create Stripe Products/Prices for one-time payment or use Checkout with `mode: 'payment'` and line items with your price.

13. **Checkout (one-time)**
    - New server action or route: account + topup_package_id → Stripe Checkout Session `mode: 'payment'`, one line item (amount from package), success_url with session_id (or payment_intent_id). Store **orders** row (pending, type topup, topup_package_id, provider_payment_intent_id when available).

14. **Webhook**
    - `checkout.session.completed` (mode payment) or `payment_intent.succeeded`: match by payment_intent_id or session to **orders**; update order (paid, paid_at); create **credit_grants** (source_type topup, source_id = order_id, no expiry or 12 months); ledger entry; update wallet balance.

15. **Idempotency**
    - For both subscription and top-up webhooks, use Stripe event id or payment_intent_id as idempotency key where applicable to avoid duplicate grants.

---

## 5. Security & Robustness

- **Webhook:** Verify signature (already in place); use event id for idempotency where relevant.
- **Queries:** Always resolve account from authenticated user (or from webhook by Stripe IDs); never trust client-supplied account_id for mutations.
- **Debit:** Single transaction, lock wallet/grants, idempotency key per debit to avoid double-spend on retries.
- **Env:** No Stripe keys in client; keep STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET server-only.

---

## 6. File / Module Layout (minimal)

- **`lib/billing/accounts.ts`** (or under `lib/db/`) – getOrCreateAccountForUser, getAccountByStripeCustomerId (via subscription).
- **`lib/billing/plans.ts`** – getPlanByCode, getStarterPlan (optional; can be single query in checkout).
- **`lib/payments/stripe.ts`** – keep; add account-based createCheckoutSession (subscription), createCheckoutSessionForTopUp, createCustomerPortalSession(account).
- **`lib/payments/actions.ts`** – use account instead of team; add top-up action if needed.
- **`lib/credits/debit.ts`** – debitCredits(accountId, amount, idempotencyKey, usageEventId?, metadata?).
- **`lib/credits/grants.ts`** – createGrantForSubscriptionCycle, createGrantForTopUp, createRolloverGrant (used by webhook and rollover job).
- **`app/api/stripe/checkout/route.ts`** – account + subscription + first cycle + first grant + ledger.
- **`app/api/stripe/webhook/route.ts`** – subscription updated/deleted; payment_intent.succeeded / checkout.session.completed for top-up.
- **Pricing page** – can stay as-is but pass account (and Stripe price from env/plan) into checkout action; optional: show “X credits/month” from plan.

---

## 7. Order of Work (recommended)

1. Phase A (account + wallet, plan seed, queries).
2. Phase B (checkout session, success callback, webhook subscription events, portal, actions using account). At this point subscription flow is account-based and can create first cycle + grant.
3. Phase C (debit module, AI usage event integration, rollover job).
4. Phase D (top-up packages, one-time checkout, webhook for payment, orders + grants).

This keeps the surface area small at each step and avoids building top-up or rollover before subscription and credits are in place.
