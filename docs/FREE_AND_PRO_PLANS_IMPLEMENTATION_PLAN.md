# Free & Pro Plans Implementation Plan

**Goal:** Free plan (default) = 5 credits/day only. Pro plan = 100 monthly + 5 daily (daily used first). Both need a cron to grant daily credits.

---

## 1. Plan Model

| Plan   | Code     | Monthly Credits | Daily Credits | Daily Cap | Rollover | Price |
|--------|----------|-----------------|---------------|-----------|----------|-------|
| Free   | `free`   | 0               | 5             | 5         | 0        | 0     |
| Pro    | `starter`| 100             | 5             | 150       | 50       | 59 PLN|

- **Free** = default for all new users (no subscription).
- **Pro** = paid Stripe subscription (existing flow).

---

## 2. Schema Changes

### 2.1 Plans table

- Add **free plan** row: `code: 'free'`, `includedCreditsPerCycle: 0`, `priceMinor: 0`, `dailyBonusCredits: 5`, `dailyBonusCapPerCycle: 5`, `rolloverCap: 0`.
- Plans table already has `dailyBonusCredits`, `dailyBonusCapPerCycle`. Free plan uses these only.

### 2.2 Credit grants – source type

- Add `daily_bonus` to `credit_grants.source_type`.
- Daily grants: `sourceType: 'daily_bonus'`, `sourceId: null` (or a `daily_bonus_grants` id if we add a table later), `expiresAt: end of same day`.

### 2.3 Credit grants – debit order (daily first)

- `credit_grants` already has `priority` (default 0).
- **Daily grants:** `priority: 0` (use first).
- **Subscription/rollover/topup grants:** `priority: 1` (use after daily).
- Update `lib/credits/debit.ts`: order by `priority ASC`, then `expiresAt ASC NULLS LAST`.

---

## 3. Daily Credits Cron

### 3.1 New cron endpoint

- **Path:** `/api/cron/daily-credits`
- **Schedule:** Daily, e.g. `0 0 * * *` (midnight UTC) or `0 6 * * *` (6:00 UTC).
- **Logic:**
  1. Get all accounts with a wallet.
  2. For each account:
     - Resolve plan: Pro subscriber → Pro plan, else → Free plan.
     - Get `dailyBonusCredits` and `dailyBonusCapPerCycle` from plan.
     - For Free: grant 5 credits (cap = 5).
     - For Pro: grant 5 credits, but cap total daily-bonus grants in current billing cycle at 150.
  3. Create grant: `sourceType: 'daily_bonus'`, `priority: 0`, `expiresAt: end of current day` (or end of billing period for cap logic).

### 3.2 Cap logic for Pro

- Track daily-bonus grants per account per billing cycle.
- Sum `creditsTotal` of `sourceType = 'daily_bonus'` grants that overlap the current subscription cycle.
- If sum + 5 > 150, grant only `150 - sum` (or 0 if already at cap).

### 3.3 Idempotency

- Use `accountId + date` as idempotency key (e.g. in metadata or a `daily_bonus_grants` table).
- If a grant for that account+date already exists, skip.

### 3.4 Vercel cron

- Add to `vercel.json`:
  ```json
  { "path": "/api/cron/daily-credits", "schedule": "0 0 * * *" }
  ```

---

## 4. Implementation Phases

### Phase A: Free plan & plan resolution

1. **Seed free plan**
   - Insert plan: `code: 'free'`, `name: 'Free'`, `priceMinor: 0`, `includedCreditsPerCycle: 0`, `dailyBonusCredits: 5`, `dailyBonusCapPerCycle: 5`, `rolloverCap: 0`, `isActive: true`, `topupsEnabled: false`.

2. **Plan resolution helper**
   - `getPlanForAccount(accountId): Promise<Plan | null>`
   - If account has active/trialing subscription → return subscription’s plan.
   - Else → return free plan.

3. **Account + wallet on sign-up**
   - `getOrCreateAccountForUser` already creates account + wallet. No change.
   - New users start with 0 credits until first daily cron run.

### Phase B: Daily credits cron

4. **`lib/billing/daily-credits.ts`**
   - `processDailyCredits(): Promise<{ accountsProcessed: number; grantsCreated: number }>`
   - For each account with wallet:
     - `plan = getPlanForAccount(accountId)`
     - Skip if `plan.dailyBonusCredits` is null or 0.
     - Check idempotency: already granted today? Skip.
     - Compute grant amount (respect cap for Pro).
     - Create grant with `sourceType: 'daily_bonus'`, `priority: 0`, `expiresAt` = end of day.

5. **`app/api/cron/daily-credits/route.ts`**
   - Protect with `CRON_SECRET` (same pattern as rollover).
   - Call `processDailyCredits()`.

6. **`vercel.json`**
   - Add daily-credits cron.

### Phase C: Debit order (daily first)

7. **`lib/credits/debit.ts`**
   - Change grant selection order from:
     - `ORDER BY expiresAt ASC NULLS LAST`
   - To:
     - `ORDER BY priority ASC, expiresAt ASC NULLS LAST`
   - Ensure daily grants use `priority: 0` and subscription/rollover/topup use `priority: 1`.

8. **`lib/billing/grants.ts`**
   - `createGrantForSubscriptionCycle`: set `priority: 1`.
   - `createRolloverGrant`: set `priority: 1`.
   - `createGrantForDailyBonus` (new): set `priority: 0`.

9. **Top-up grants**
   - When adding top-up grant logic, set `priority: 1`.

### Phase D: UI & UX

10. **Pricing page**
    - Show Free plan: “5 credits/day” (no price).
    - Show Pro plan: “100 credits/month + 5/day (up to 150/month), rollover”.

11. **Dashboard / billing**
    - Show “Free” or “Pro” based on plan.
    - Show credit balance and breakdown (daily vs subscription if desired).

---

## 5. Daily Credits – Detailed Logic

### 5.1 Grant expiry

- `expiresAt` = end of current day (UTC) or end of billing period for cap.
- For simplicity: `expiresAt = end of day` so unused daily credits expire at midnight.

### 5.2 Pro cap (150/month)

- Get current subscription cycle for account.
- Sum credits from `credit_grants` where `sourceType = 'daily_bonus'` and `createdAt` is within current cycle.
- If `sum + 5 <= 150`, grant 5; else grant `max(0, 150 - sum)`.

### 5.3 Idempotency

- Option A: `credit_ledger_entries` metadata `{ dailyGrantDate: 'YYYY-MM-DD' }` for grant entries.
- Option B: New table `daily_bonus_grants` with `(account_id, date)` unique.
- Option C: Check if any `credit_grants` with `sourceType = 'daily_bonus'` has `createdAt` today for this account. Simpler but less precise.

### 5.4 Timezone

- Use UTC for “day” and cron. Alternatively, use a configurable timezone (e.g. Europe/Warsaw) for “start of day”.

---

## 6. File / Module Layout

| File | Purpose |
|------|---------|
| `lib/billing/plans.ts` | Add `getPlanForAccount`, `getFreePlan` |
| `lib/billing/daily-credits.ts` | `processDailyCredits()` |
| `lib/billing/grants.ts` | Add `createGrantForDailyBonus`, set priority on existing grants |
| `lib/credits/debit.ts` | Order by priority ASC, expiresAt ASC |
| `app/api/cron/daily-credits/route.ts` | Cron endpoint |
| `lib/db/seed.ts` | Add free plan |
| `vercel.json` | Add daily-credits cron |

---

## 7. Order of Work

1. Phase A: Free plan seed, plan resolution.
2. Phase B: Daily credits cron (processDailyCredits, route, vercel.json).
3. Phase C: Debit order + priority on grants.
4. Phase D: UI updates (pricing, dashboard).

---

## 8. Edge Cases

- **New user before first cron:** 0 credits until next cron. Option: grant 5 on first login if no grant today (lazy grant).
- **User upgrades from Free to Pro mid-cycle:** Pro plan applies; daily cap resets for new cycle.
- **User downgrades:** Subscription ends; next cycle they’re on Free (5/day only).
- **Cron runs twice per day:** Idempotency prevents double grants.
