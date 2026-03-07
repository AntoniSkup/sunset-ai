import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { creditGrants, creditWallets } from "@/lib/db/schema";
import { getWalletByAccountId } from "./accounts";
import { getPlanById } from "./plans";
import type { Subscription } from "@/lib/db/schema";

export type CreditsBreakdown = {
  balance: number;
  daily: { total: number; remaining: number };
  monthly: { total: number; remaining: number } | null;
};

export async function getCreditsBreakdown(
  accountId: number,
  subscription: Subscription | null
): Promise<CreditsBreakdown> {
  const wallet = await getWalletByAccountId(accountId);
  const balance = wallet?.balanceCached ?? 0;

  const plan = subscription
    ? await getPlanById(subscription.planId)
    : null;

  const dailyTotal = plan?.dailyBonusCredits ?? 5;
  const monthlyTotal = plan?.includedCreditsPerCycle ?? 0;

  if (!wallet) {
    return {
      balance,
      daily: { total: dailyTotal, remaining: Math.min(balance, dailyTotal) },
      monthly:
        monthlyTotal > 0
          ? { total: monthlyTotal, remaining: Math.min(balance, monthlyTotal) }
          : null,
    };
  }

  const grants = await db
    .select({
      sourceType: creditGrants.sourceType,
      creditsRemaining: creditGrants.creditsRemaining,
    })
    .from(creditGrants)
    .where(
      and(
        eq(creditGrants.walletId, wallet.id),
        sql`${creditGrants.creditsRemaining} > 0`
      )
    );

  const dailyRemaining = grants
    .filter((g) => g.sourceType === "daily_bonus")
    .reduce((sum, g) => sum + g.creditsRemaining, 0);

  const monthlyRemaining = grants
    .filter((g) =>
      ["subscription_cycle", "rollover"].includes(g.sourceType)
    )
    .reduce((sum, g) => sum + g.creditsRemaining, 0);

  return {
    balance,
    daily: {
      total: dailyTotal,
      remaining:
        dailyTotal > 0
          ? dailyRemaining > 0
            ? dailyRemaining
            : dailyTotal
          : 0,
    },
    monthly:
      monthlyTotal > 0
        ? {
            total: monthlyTotal,
            remaining: monthlyRemaining,
          }
        : null,
  };
}
