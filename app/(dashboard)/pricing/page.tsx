import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { checkoutAction, checkoutTopupAction } from "@/lib/payments/actions";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { getPlanByCode, getPlanById } from "@/lib/billing/plans";
import { getActiveTopupPackages } from "@/lib/billing/topup-packages";
import {
  getAccountForUser,
  getSubscriptionByAccountId,
} from "@/lib/billing/accounts";
import { getUser } from "@/lib/db/queries";
import { siteConfig } from "@/lib/seo/site";
import { SubmitButton } from "./submit-button";
import { PricingNavMenu } from "./pricing-nav-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const revalidate = 3600;

const pricingDescription = `Simple, credit-based pricing for ${siteConfig.name}, the ${siteConfig.shortDescription}. Subscribe monthly or buy one-time top-ups whenever you need extra credits.`;

export const metadata: Metadata = {
  title: "Pricing",
  description: pricingDescription,
  alternates: { canonical: "/pricing" },
  openGraph: {
    type: "website",
    url: "/pricing",
    siteName: siteConfig.name,
    title: `Pricing — ${siteConfig.name}`,
    description: pricingDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: `Pricing — ${siteConfig.name}`,
    description: pricingDescription,
  },
};

export default async function PricingPage() {
  const user = await getUser();
  const [plan, topupPackages, subscriptionPayload] = await Promise.all([
    getPlanByCode("starter"),
    getActiveTopupPackages(),
    (async () => {
      if (!user) return null;
      const account = await getAccountForUser(user.id);
      if (!account) return null;
      const subscription = await getSubscriptionByAccountId(account.id);
      if (
        !subscription ||
        (subscription.status !== "active" && subscription.status !== "trialing")
      )
        return null;
      const planRow = await getPlanById(subscription.planId);
      return {
        planName: planRow?.name ?? "Starter",
        status: subscription.status,
      };
    })(),
  ]);

  const topupPackage =
    topupPackages.find(
      (pkg) => pkg.code === "topup_100" || Number(pkg.creditsAmount) === 100
    ) ??
    topupPackages[0] ??
    null;

  return (
    <main className="relative min-h-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="absolute left-4 top-6 sm:left-6 lg:left-8 lg:top-8">
        <PricingNavMenu />
      </div>

      <div className="mx-auto mt-8 max-w-5xl p-6 sm:mt-10 sm:p-8 lg:mt-12 lg:p-10">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex rounded-full border border-orange-200 bg-orange-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-orange-500">
            Pricing
          </span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Choose the credits that fit your workflow
          </h1>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Keep a recurring monthly balance or make a one-time purchase
            whenever you need extra credits.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-5xl gap-6 lg:grid-cols-2">
          <StarterPlanCard
            plan={plan}
            hasActiveSubscription={!!subscriptionPayload}
          />
          {topupPackage && <TopupCard pkg={topupPackage} />}
        </div>
      </div>
    </main>
  );
}

function formatPrice(priceMinor: number, currency: string) {
  const amount = priceMinor / 100;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function FeatureItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm text-muted-foreground">
      <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#f87c07]" />
      <span>{children}</span>
    </li>
  );
}

function StarterPlanCard({
  plan,
  hasActiveSubscription = false,
}: {
  plan: Awaited<ReturnType<typeof getPlanByCode>>;
  hasActiveSubscription?: boolean;
}) {
  if (!plan) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Starter plan not configured.
          </p>
        </CardContent>
      </Card>
    );
  }

  const priceDisplay = formatPrice(plan.priceMinor, plan.currency || "PLN");
  const includedCredits = Number(plan.includedCreditsPerCycle);
  const rolloverCap = Number(plan.rolloverCap);
  const dailyBonusCredits =
    plan.dailyBonusCredits != null ? Number(plan.dailyBonusCredits) : null;
  const dailyBonusCap =
    plan.dailyBonusCapPerCycle != null
      ? Number(plan.dailyBonusCapPerCycle)
      : null;

  return (
    <Card className="relative overflow-hidden border-orange-200 bg-background shadow-md">
      <div className="absolute inset-x-0 top-0 h-1 bg-orange-500" />
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {hasActiveSubscription ? "Your plan" : "Subscription"}
          </span>
          <span className="inline-flex rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            {hasActiveSubscription ? "Active" : "Monthly billing"}
          </span>
        </div>
        <div className="space-y-2">
          <CardTitle className="text-2xl">{plan.name}</CardTitle>
          <CardDescription className="text-sm">
            Recurring credits for ongoing work and predictable monthly usage.
          </CardDescription>
        </div>
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <span className="text-4xl font-semibold tracking-tight text-foreground">
              {priceDisplay}
            </span>
            <span className="pb-1 text-sm text-muted-foreground">
              / {plan.billingInterval}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {includedCredits} credits every {plan.billingInterval}
          </p>
        </div>
      </CardHeader>

      <CardContent>
        <ul className="space-y-3">
          <FeatureItem>
            {includedCredits} credits included each month
          </FeatureItem>
          {dailyBonusCredits != null && (
            <FeatureItem>
              {dailyBonusCredits} daily bonus credits
              {dailyBonusCap != null
                ? ` (up to ${dailyBonusCap} each month)`
                : ""}
            </FeatureItem>
          )}
          <FeatureItem>
            Roll over up to {rolloverCap} unused credits
          </FeatureItem>
          <FeatureItem>Top up anytime if you need more capacity</FeatureItem>
        </ul>
      </CardContent>

      <CardFooter className="mt-auto flex-col items-stretch gap-3">
        {hasActiveSubscription ? (
          <>
            <Button
              disabled
              variant="secondary"
              className="rounded-xl cursor-not-allowed opacity-70"
            >
              Your current plan
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <Link
                href="/dashboard/payments"
                className="underline hover:no-underline"
              >
                Manage subscription
              </Link>
            </p>
          </>
        ) : (
          <>
            <form action={checkoutAction}>
              <SubmitButton variant="default" className="rounded-xl" />
            </form>
            <p className="text-center text-xs text-muted-foreground">
              Renews automatically. Manage or cancel anytime in billing.
            </p>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

function TopupCard({
  pkg,
}: {
  pkg: Awaited<ReturnType<typeof getActiveTopupPackages>>[number];
}) {
  const priceDisplay = formatPrice(pkg.priceMinor, pkg.currency);
  const creditsAmount = Number(pkg.creditsAmount);

  return (
    <Card className="border-border bg-muted/20">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            One-time payment
          </span>
          <span className="inline-flex rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            Flexible usage
          </span>
        </div>
        <div className="space-y-2">
          <CardTitle className="text-2xl">Credit top-up</CardTitle>
          <CardDescription className="text-sm">
            Buy extra credits once and keep them available for future usage.
          </CardDescription>
        </div>
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <span className="text-4xl font-semibold tracking-tight text-foreground">
              {priceDisplay}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {creditsAmount} credits added with a single payment
          </p>
        </div>
      </CardHeader>

      <CardContent>
        <ul className="space-y-3">
          <FeatureItem>{creditsAmount} credits added instantly</FeatureItem>
          <FeatureItem>One-time payment with no recurring billing</FeatureItem>
          <FeatureItem>Credits never expire after purchase</FeatureItem>
          <FeatureItem>
            Works on its own or alongside your subscription
          </FeatureItem>
        </ul>
      </CardContent>

      <CardFooter className="mt-auto flex-col items-stretch gap-3">
        <form action={checkoutTopupAction}>
          <input type="hidden" name="topup_code" value={pkg.code} />
          <SubmitButton
            label={`Buy ${pkg.name}`}
            variant="outline"
            className="rounded-xl"
          />
        </form>
        <p className="text-center text-xs text-muted-foreground">
          Ideal when you only need extra credits from time to time.
        </p>
      </CardFooter>
    </Card>
  );
}
