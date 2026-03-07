import Stripe from "stripe";
import { redirect } from "next/navigation";
import type { Account, Team } from "@/lib/db/schema";
import {
  getUser,
  getTeamByStripeCustomerId,
  updateTeamSubscription,
} from "@/lib/db/queries";
import {
  getOrCreateAccountForUser,
  getSubscriptionByAccountId,
  getSubscriptionByProviderSubscriptionId,
} from "@/lib/billing/accounts";
import { getPlanById } from "@/lib/billing/plans";
import { createSubscriptionCycleAndGrant } from "@/lib/billing/grants";
import { db } from "@/lib/db/drizzle";
import { subscriptions, subscriptionCycles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const STARTER_PRICE_ID = process.env.STRIPE_STARTER_PRICE_ID;

/**
 * Create Stripe Checkout session for Starter subscription (account-based).
 * Uses STRIPE_STARTER_PRICE_ID. Redirects to sign-up if not authenticated.
 */
export async function createCheckoutSessionForStarter() {
  const user = await getUser();
  if (!user) {
    redirect(`/sign-in?redirect=/pricing`);
  }

  if (!STARTER_PRICE_ID) {
    throw new Error("STRIPE_STARTER_PRICE_ID is not set");
  }

  const account = await getOrCreateAccountForUser(user.id);
  const existingSubscription = await getSubscriptionByAccountId(account.id);
  const customerId = existingSubscription?.providerCustomerId ?? undefined;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price: STARTER_PRICE_ID,
        quantity: 1,
      },
    ],
    mode: "subscription",
    success_url: `${process.env.BASE_URL}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/pricing`,
    customer: customerId,
    client_reference_id: user.id.toString(),
    allow_promotion_codes: true,
  });

  redirect(session.url!);
}

/**
 * Create Stripe Customer Portal session for an account (manage subscription).
 */
export async function createCustomerPortalSession(account: Account) {
  const subscription = await getSubscriptionByAccountId(account.id);
  if (!subscription?.providerCustomerId) {
    redirect("/pricing");
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: subscription.providerCustomerId,
    return_url: `${process.env.BASE_URL}/dashboard`,
  });

  redirect(portalSession.url);
}

/**
 * Handle subscription.updated / subscription.deleted from Stripe webhook.
 * Updates our subscriptions row; on renewal creates new cycle + credit grant.
 */
function getSubscriptionPeriodDates(sub: Stripe.Subscription): {
  start: Date | null;
  end: Date | null;
} {
  let periodStart = (sub as { current_period_start?: number }).current_period_start ?? null;
  let periodEnd = (sub as { current_period_end?: number }).current_period_end ?? null;
  if ((periodStart == null || periodEnd == null) && sub.items?.data?.[0]) {
    const item = sub.items.data[0] as { current_period_start?: number; current_period_end?: number };
    periodStart = periodStart ?? item.current_period_start ?? null;
    periodEnd = periodEnd ?? item.current_period_end ?? null;
  }
  if ((periodStart == null || periodEnd == null) && sub.status === "trialing") {
    periodStart = periodStart ?? sub.trial_start ?? null;
    periodEnd = periodEnd ?? sub.trial_end ?? null;
  }
  return {
    start: periodStart != null ? new Date(periodStart * 1000) : null,
    end: periodEnd != null ? new Date(periodEnd * 1000) : null,
  };
}

export async function handleSubscriptionChange(
  stripeSubscription: Stripe.Subscription
) {
  const subscriptionId = stripeSubscription.id;
  const customerId =
    typeof stripeSubscription.customer === "string"
      ? stripeSubscription.customer
      : stripeSubscription.customer.id;
  const status = stripeSubscription.status;
  const { start: currentPeriodStart, end: currentPeriodEnd } =
    getSubscriptionPeriodDates(stripeSubscription);
  const cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end ?? false;
  const canceledAt =
    stripeSubscription.canceled_at != null
      ? new Date(stripeSubscription.canceled_at * 1000)
      : null;

  const ourSub =
    await getSubscriptionByProviderSubscriptionId(subscriptionId);
  if (!ourSub) {
    return;
  }

  await db
    .update(subscriptions)
    .set({
      status,
      providerCustomerId: customerId,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      canceledAt,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, ourSub.id));

  if (
    (status === "active" || status === "trialing") &&
    currentPeriodStart &&
    currentPeriodEnd
  ) {
    const plan = await getPlanById(ourSub.planId);
    if (plan) {
      const cycles = await db
        .select()
        .from(subscriptionCycles)
        .where(eq(subscriptionCycles.subscriptionId, ourSub.id));
      const hasCycleForPeriod = cycles.some(
        (c) => c.periodStart.getTime() === currentPeriodStart.getTime()
      );
      if (!hasCycleForPeriod) {
        await createSubscriptionCycleAndGrant(
          ourSub.accountId,
          ourSub.id,
          currentPeriodStart,
          currentPeriodEnd,
          plan.includedCreditsPerCycle
        );
      }
    }
  }
}


export async function createCheckoutSession({
  team,
  priceId,
}: {
  team: Team | null;
  priceId: string;
}) {
  const user = await getUser();

  if (!team || !user) {
    redirect(`/sign-up?redirect=checkout&priceId=${priceId}`);
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: "subscription",
    success_url: `${process.env.BASE_URL}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.BASE_URL}/pricing`,
    customer: team.stripeCustomerId || undefined,
    client_reference_id: user.id.toString(),
    allow_promotion_codes: true,
  });

  redirect(session.url!);
}

export async function createCustomerPortalSessionLegacy(team: Team) {
  if (!team.stripeCustomerId || !team.stripeProductId) {
    redirect("/pricing");
  }

  let configuration: Stripe.BillingPortal.Configuration;
  const configurations = await stripe.billingPortal.configurations.list();

  if (configurations.data.length > 0) {
    configuration = configurations.data[0];
  } else {
    const product = await stripe.products.retrieve(team.stripeProductId);
    if (!product.active) {
      throw new Error("Team's product is not active in Stripe");
    }

    const prices = await stripe.prices.list({
      product: product.id,
      active: true,
    });
    if (prices.data.length === 0) {
      throw new Error("No active prices found for the team's product");
    }

    configuration = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: "Manage your subscription",
      },
      features: {
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["price", "quantity", "promotion_code"],
          proration_behavior: "create_prorations",
          products: [
            {
              product: product.id,
              prices: prices.data.map((price) => price.id),
            },
          ],
        },
        subscription_cancel: {
          enabled: true,
          mode: "at_period_end",
          cancellation_reason: {
            enabled: true,
            options: [
              "too_expensive",
              "missing_features",
              "switched_service",
              "unused",
              "other",
            ],
          },
        },
        payment_method_update: {
          enabled: true,
        },
      },
    });
  }

  return stripe.billingPortal.sessions.create({
    customer: team.stripeCustomerId,
    return_url: `${process.env.BASE_URL}/dashboard`,
    configuration: configuration.id,
  });
}

export async function handleTeamSubscriptionChange(
  subscription: Stripe.Subscription,
) {
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  const team = await getTeamByStripeCustomerId(customerId);

  if (!team) {
    console.error("Team not found for Stripe customer:", customerId);
    return;
  }

  if (status === "active" || status === "trialing") {
    const plan = subscription.items.data[0]?.plan;
    await updateTeamSubscription(team.id, {
      stripeSubscriptionId: subscriptionId,
      stripeProductId: plan?.product as string,
      planName: (plan?.product as Stripe.Product).name,
      subscriptionStatus: status,
    });
  } else if (status === "canceled" || status === "unpaid") {
    await updateTeamSubscription(team.id, {
      stripeSubscriptionId: null,
      stripeProductId: null,
      planName: null,
      subscriptionStatus: status,
    });
  }
}

export async function getStripePrices() {
  const prices = await stripe.prices.list({
    expand: ["data.product"],
    active: true,
    type: "recurring",
  });

  return prices.data.map((price) => ({
    id: price.id,
    productId:
      typeof price.product === "string" ? price.product : price.product.id,
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval,
    trialPeriodDays: price.recurring?.trial_period_days,
  }));
}

export async function getStripeProducts() {
  const products = await stripe.products.list({
    active: true,
    expand: ["data.default_price"],
  });

  return products.data.map((product) => ({
    id: product.id,
    name: product.name,
    description: product.description,
    defaultPriceId:
      typeof product.default_price === "string"
        ? product.default_price
        : product.default_price?.id,
  }));
}
