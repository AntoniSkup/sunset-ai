import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { creditGrants, creditWallets, subscriptionCycles } from "@/lib/db/schema";
import { getPlanForAccount } from "./plans";
import { createGrantForDailyBonus } from "./grants";

/**
 * Start of today in UTC (00:00:00.000).
 */
function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0,
      0,
      0,
      0
    )
  );
}

/**
 * End of today in UTC (23:59:59.999).
 */
function endOfTodayUTC(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
}

/**
 * Grant today's daily bonus for a single account if eligible and not already granted.
 * Safe to call alongside the cron because it checks idempotency by account + day.
 */
export async function ensureDailyCreditsForAccount(
  accountId: number
): Promise<{ granted: boolean; amount: number }> {
  const now = new Date();
  const startOfToday = startOfTodayUTC();
  const endOfToday = endOfTodayUTC();

  const plan = await getPlanForAccount(accountId);
  if (!plan) return { granted: false, amount: 0 };

  const dailyBonus =
    plan.dailyBonusCredits != null ? Number(plan.dailyBonusCredits) : 0;
  if (dailyBonus <= 0) return { granted: false, amount: 0 };

  const [existingToday] = await db
    .select({ id: creditGrants.id })
    .from(creditGrants)
    .where(
      and(
        eq(creditGrants.accountId, accountId),
        eq(creditGrants.sourceType, "daily_bonus"),
        gte(creditGrants.createdAt, startOfToday),
        lte(creditGrants.createdAt, endOfToday)
      )
    )
    .limit(1);
  if (existingToday) return { granted: false, amount: 0 };

  const dailyCap =
    plan.dailyBonusCapPerCycle != null
      ? Number(plan.dailyBonusCapPerCycle)
      : dailyBonus;

  let grantAmount = dailyBonus;

  if (dailyCap > dailyBonus) {
    const [openCycle] = await db
      .select()
      .from(subscriptionCycles)
      .where(
        and(
          eq(subscriptionCycles.accountId, accountId),
          eq(subscriptionCycles.status, "open"),
          lte(subscriptionCycles.periodStart, now),
          gte(subscriptionCycles.periodEnd, now)
        )
      )
      .limit(1);

    if (openCycle) {
      const cycleStart =
        openCycle.periodStart instanceof Date
          ? openCycle.periodStart
          : new Date(openCycle.periodStart);
      const cycleEnd =
        openCycle.periodEnd instanceof Date
          ? openCycle.periodEnd
          : new Date(openCycle.periodEnd);

      const [sumRow] = await db
        .select({
          total: sql<number>`COALESCE(SUM(${creditGrants.creditsTotal}), 0)::numeric`,
        })
        .from(creditGrants)
        .where(
          and(
            eq(creditGrants.accountId, accountId),
            eq(creditGrants.sourceType, "daily_bonus"),
            gte(creditGrants.createdAt, cycleStart),
            lte(creditGrants.createdAt, cycleEnd)
          )
        );
      const sumInCycle = sumRow ? Number(sumRow.total) : 0;
      const remaining = Math.max(0, dailyCap - sumInCycle);
      grantAmount = Math.min(dailyBonus, remaining);
    }
  }

  if (grantAmount <= 0) return { granted: false, amount: 0 };

  await createGrantForDailyBonus(accountId, grantAmount, endOfToday);
  return { granted: true, amount: grantAmount };
}

/**
 * Process daily credits for all accounts with a wallet.
 * For each account: resolve plan (Pro if active/trialing subscription, else Free),
 * skip if plan has no daily bonus; idempotency: skip if already granted today;
 * for Pro apply per-cycle cap (sum of daily_bonus grants in current cycle); create grant.
 * Run daily via cron (e.g. midnight UTC).
 */
export async function processDailyCredits(): Promise<{
  accountsProcessed: number;
  grantsCreated: number;
}> {
  const wallets = await db.select({ accountId: creditWallets.accountId }).from(creditWallets);
  let accountsProcessed = 0;
  let grantsCreated = 0;

  for (const { accountId } of wallets) {
    accountsProcessed++;
    try {
      const result = await ensureDailyCreditsForAccount(accountId);
      if (result.granted) {
        grantsCreated++;
      }
    } catch (err) {
      console.error(`[DailyCredits] Account ${accountId}:`, err);
    }
  }

  return { accountsProcessed, grantsCreated };
}
