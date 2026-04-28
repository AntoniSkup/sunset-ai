import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pricing");
  const description = t("metaDescription", {
    brand: siteConfig.name,
    tagline: siteConfig.shortDescription,
  });
  const titleSocial = t("metaTitleSocial", { brand: siteConfig.name });
  return {
    title: t("metaTitle"),
    description,
    alternates: { canonical: "/pricing" },
    openGraph: {
      type: "website",
      url: "/pricing",
      siteName: siteConfig.name,
      title: titleSocial,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: titleSocial,
      description,
    },
  };
}

export default async function PricingPage() {
  const user = await getUser();
  const [t, plan, topupPackages, subscriptionPayload] = await Promise.all([
    getTranslations("pricing"),
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
            {t("badge")}
          </span>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            {t("heading")}
          </h1>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            {t("subheading")}
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

function formatPrice(priceMinor: number, currency: string, locale: string) {
  const amount = priceMinor / 100;

  return new Intl.NumberFormat(locale, {
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

async function StarterPlanCard({
  plan,
  hasActiveSubscription = false,
}: {
  plan: Awaited<ReturnType<typeof getPlanByCode>>;
  hasActiveSubscription?: boolean;
}) {
  const t = await getTranslations("pricing");
  const locale = await getLocale();

  if (!plan) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            {t("starterNotConfigured")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const priceDisplay = formatPrice(
    plan.priceMinor,
    plan.currency || "PLN",
    locale
  );
  const includedCredits = Number(plan.includedCreditsPerCycle);
  const rolloverCap = Number(plan.rolloverCap);
  const dailyBonusCredits =
    plan.dailyBonusCredits != null ? Number(plan.dailyBonusCredits) : null;
  const dailyBonusCap =
    plan.dailyBonusCapPerCycle != null
      ? Number(plan.dailyBonusCapPerCycle)
      : null;

  // Translate the billing interval ("month", "year", ...) when known; fall
  // back to the raw value for any custom intervals not in the dictionary.
  const intervalLabel = (() => {
    const key = `interval.${plan.billingInterval}`;
    try {
      return (t as unknown as (k: string) => string)(key);
    } catch {
      return plan.billingInterval;
    }
  })();

  return (
    <Card className="relative overflow-hidden border-orange-200 bg-background shadow-md">
      <div className="absolute inset-x-0 top-0 h-1 bg-orange-500" />
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {hasActiveSubscription
              ? t("starter.yourPlan")
              : t("starter.subscription")}
          </span>
          <span className="inline-flex rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            {hasActiveSubscription
              ? t("starter.active")
              : t("starter.monthlyBilling")}
          </span>
        </div>
        <div className="space-y-2">
          <CardTitle className="text-2xl">{plan.name}</CardTitle>
          <CardDescription className="text-sm">
            {t("starter.description")}
          </CardDescription>
        </div>
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <span className="text-4xl font-semibold tracking-tight text-foreground">
              {priceDisplay}
            </span>
            <span className="pb-1 text-sm text-muted-foreground">
              {t("starter.perInterval", { interval: intervalLabel })}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("starter.creditsEveryInterval", {
              credits: includedCredits,
              interval: intervalLabel,
            })}
          </p>
        </div>
      </CardHeader>

      <CardContent>
        <ul className="space-y-3">
          <FeatureItem>
            {t("starter.featureIncluded", { credits: includedCredits })}
          </FeatureItem>
          {dailyBonusCredits != null && (
            <FeatureItem>
              {dailyBonusCap != null
                ? t("starter.featureDailyBonusWithCap", {
                    credits: dailyBonusCredits,
                    cap: dailyBonusCap,
                  })
                : t("starter.featureDailyBonus", {
                    credits: dailyBonusCredits,
                  })}
            </FeatureItem>
          )}
          <FeatureItem>
            {t("starter.featureRollover", { cap: rolloverCap })}
          </FeatureItem>
          <FeatureItem>{t("starter.featureTopupAnytime")}</FeatureItem>
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
              {t("starter.currentPlanCta")}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <Link
                href="/dashboard/payments"
                className="underline hover:no-underline"
              >
                {t("starter.manageSubscription")}
              </Link>
            </p>
          </>
        ) : (
          <>
            <form action={checkoutAction}>
              <SubmitButton variant="default" className="rounded-xl" />
            </form>
            <p className="text-center text-xs text-muted-foreground">
              {t("starter.autoRenewNote")}
            </p>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

async function TopupCard({
  pkg,
}: {
  pkg: Awaited<ReturnType<typeof getActiveTopupPackages>>[number];
}) {
  const t = await getTranslations("pricing");
  const locale = await getLocale();
  const priceDisplay = formatPrice(pkg.priceMinor, pkg.currency, locale);
  const creditsAmount = Number(pkg.creditsAmount);

  return (
    <Card className="border-border bg-muted/20">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            {t("topup.badge")}
          </span>
          <span className="inline-flex rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            {t("topup.flexibleUsage")}
          </span>
        </div>
        <div className="space-y-2">
          <CardTitle className="text-2xl">{t("topup.title")}</CardTitle>
          <CardDescription className="text-sm">
            {t("topup.description")}
          </CardDescription>
        </div>
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <span className="text-4xl font-semibold tracking-tight text-foreground">
              {priceDisplay}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("topup.addedWithSinglePayment", { credits: creditsAmount })}
          </p>
        </div>
      </CardHeader>

      <CardContent>
        <ul className="space-y-3">
          <FeatureItem>
            {t("topup.featureAddedInstantly", { credits: creditsAmount })}
          </FeatureItem>
          <FeatureItem>{t("topup.featureNoRecurring")}</FeatureItem>
          <FeatureItem>{t("topup.featureNeverExpire")}</FeatureItem>
          <FeatureItem>{t("topup.featureStandalone")}</FeatureItem>
        </ul>
      </CardContent>

      <CardFooter className="mt-auto flex-col items-stretch gap-3">
        <form action={checkoutTopupAction}>
          <input type="hidden" name="topup_code" value={pkg.code} />
          <SubmitButton
            label={t("topup.buyLabel", { name: pkg.name })}
            variant="outline"
            className="rounded-xl"
          />
        </form>
        <p className="text-center text-xs text-muted-foreground">
          {t("topup.idealNote")}
        </p>
      </CardFooter>
    </Card>
  );
}
