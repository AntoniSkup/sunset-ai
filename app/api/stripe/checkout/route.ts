import { eq } from "drizzle-orm";
import { db } from "@/lib/db/drizzle";
import { users, subscriptions } from "@/lib/db/schema";
import { setSession } from "@/lib/auth/session";
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/payments/stripe";
import Stripe from "stripe";
import {
  getOrCreateAccountForUser,
  getWalletByAccountId,
  getSubscriptionByProviderSubscriptionId,
} from "@/lib/billing/accounts";
import { getPlanByCode } from "@/lib/billing/plans";
import { createSubscriptionCycleAndGrant } from "@/lib/billing/grants";
import { handleCheckoutSessionCompletedPayment } from "@/lib/payments/stripe";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.redirect(new URL("/pricing", request.url));
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["customer", "subscription"],
    });

    const userIdRaw = session.client_reference_id;
    if (!userIdRaw) {
      throw new Error("No user ID in session client_reference_id.");
    }
    const userId = Number(userIdRaw);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      throw new Error("User not found.");
    }

    if (session.mode === "payment") {
      await handleCheckoutSessionCompletedPayment(session);
      await setSession(user);
      return NextResponse.redirect(
        new URL("/dashboard/payments?topup=1", request.url)
      );
    }

    if (!session.customer || typeof session.customer === "string") {
      throw new Error("Invalid customer data from Stripe.");
    }

    const customerId = session.customer.id;
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId) {
      throw new Error("No subscription found for this session.");
    }

    const stripeSubscription = await stripe.subscriptions.retrieve(
      subscriptionId,
      { expand: ["items.data.price.product"] }
    );

    const account = await getOrCreateAccountForUser(user.id);
    const wallet = await getWalletByAccountId(account.id);
    if (!wallet) {
      throw new Error("Credit wallet not found for account.");
    }

    const plan = await getPlanByCode("starter");
    if (!plan) {
      throw new Error("Starter plan not found in database.");
    }

    const sub = stripeSubscription as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
    };
    let periodStart = sub.current_period_start ?? null;
    let periodEnd = sub.current_period_end ?? null;
    if ((periodStart == null || periodEnd == null) && sub.items?.data?.[0]) {
      const item = sub.items.data[0] as { current_period_start?: number; current_period_end?: number };
      periodStart = periodStart ?? item.current_period_start ?? null;
      periodEnd = periodEnd ?? item.current_period_end ?? null;
    }
    if ((periodStart == null || periodEnd == null) && sub.status === "trialing") {
      periodStart = periodStart ?? sub.trial_start ?? null;
      periodEnd = periodEnd ?? sub.trial_end ?? null;
    }
    const currentPeriodStart =
      periodStart != null ? new Date(periodStart * 1000) : null;
    const currentPeriodEnd =
      periodEnd != null ? new Date(periodEnd * 1000) : null;

    if (!currentPeriodStart || !currentPeriodEnd) {
      throw new Error("Subscription period dates missing.");
    }

    const existingSub =
      await getSubscriptionByProviderSubscriptionId(subscriptionId);
    if (existingSub) {
      await setSession(user);
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    const [subscription] = await db
      .insert(subscriptions)
      .values({
        accountId: account.id,
        planId: plan.id,
        status: stripeSubscription.status,
        provider: "stripe",
        providerCustomerId: customerId,
        providerSubscriptionId: subscriptionId,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end ?? false,
      })
      .returning();

    if (!subscription) {
      throw new Error("Failed to create subscription.");
    }

    await createSubscriptionCycleAndGrant(
      account.id,
      subscription.id,
      currentPeriodStart,
      currentPeriodEnd,
      plan.includedCreditsPerCycle
    );

    await setSession(user);
    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    console.error("Error handling checkout success:", error);
    return NextResponse.redirect(new URL("/error", request.url));
  }
}
