import { NextResponse } from "next/server";
import { getUser } from "@/lib/db/queries";
import {
  getOrCreateAccountForUser,
  getSubscriptionByAccountId,
} from "@/lib/billing/accounts";
import { getPlanById } from "@/lib/billing/plans";
import { getCreditsBreakdown } from "@/lib/billing/credits-breakdown";
import { ensureDailyCreditsForAccount } from "@/lib/billing/daily-credits";
import { expireCreditsForAccount } from "@/lib/billing/expire-credits";

export type BillingApiResponse = {
  balance: number;
  credits: {
    daily: { total: number; remaining: number };
    monthly: { total: number; remaining: number } | null;
    topup: { remaining: number };
  };
  subscription: {
    status: string;
    planName: string;
  } | null;
};

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getOrCreateAccountForUser(user.id);
  // Expire first so stale daily grants from previous days (and any expired
  // subscription_cycle/rollover grants) are zeroed before we count remaining.
  // Without this, the daily cron is the only thing that runs expiry, so a
  // user logging in after a multi-day gap would see leftover daily credits
  // counted into "today's" remaining.
  await expireCreditsForAccount(account.id);
  await ensureDailyCreditsForAccount(account.id);

  const subscription = await getSubscriptionByAccountId(account.id);
  const { balance, daily, monthly, topup } = await getCreditsBreakdown(
    account.id,
    subscription
  );

  let subscriptionPayload: BillingApiResponse["subscription"] = null;
  if (subscription) {
    const plan = await getPlanById(subscription.planId);
    subscriptionPayload = {
      status: subscription.status,
      planName: plan?.name ?? "Starter",
    };
  }

  return NextResponse.json({
    balance,
    credits: { daily, monthly, topup },
    subscription: subscriptionPayload,
  } satisfies BillingApiResponse);
}
