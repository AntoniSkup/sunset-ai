import { NextResponse } from "next/server";
import { getUser } from "@/lib/db/queries";
import {
  getAccountForUser,
  getSubscriptionByAccountId,
  getWalletByAccountId,
} from "@/lib/billing/accounts";
import { getPlanById } from "@/lib/billing/plans";

export type BillingApiResponse = {
  balance: number;
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

  const account = await getAccountForUser(user.id);
  if (!account) {
    return NextResponse.json({
      balance: 0,
      subscription: null,
    } satisfies BillingApiResponse);
  }

  const [wallet, subscription] = await Promise.all([
    getWalletByAccountId(account.id),
    getSubscriptionByAccountId(account.id),
  ]);

  const balance = wallet?.balanceCached ?? 0;
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
    subscription: subscriptionPayload,
  } satisfies BillingApiResponse);
}
