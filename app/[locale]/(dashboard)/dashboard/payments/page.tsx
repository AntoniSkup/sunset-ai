"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { customerPortalAction } from "@/lib/payments/actions";
import useSWR, { mutate } from "swr";
import { Suspense, useEffect } from "react";
import type { BillingApiResponse } from "@/app/api/billing/route";
import {
  ArrowRightIcon,
  BanknotesIcon,
  CheckCircleIcon,
  CreditCardIcon,
} from "@heroicons/react/24/outline";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const cardClass =
  "mb-6 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur shadow-[0_8px_30px_-12px_rgba(15,23,42,0.08)]";

function BillingSkeleton() {
  const tBilling = useTranslations("dashboard.billing");
  return (
    <Card className={cardClass}>
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
          {tBilling("title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-40 rounded bg-gray-200" />
          <div className="h-4 w-56 rounded bg-gray-100" />
          <div className="h-9 w-44 rounded-full bg-gray-200" />
        </div>
      </CardContent>
    </Card>
  );
}

function BillingCard() {
  const tBilling = useTranslations("dashboard.billing");
  const { data, isLoading } = useSWR<BillingApiResponse>(
    "/api/billing",
    fetcher
  );

  if (isLoading || !data) {
    return <BillingSkeleton />;
  }

  const { balance, credits, subscription } = data;
  const hasActiveSubscription =
    subscription &&
    (subscription.status === "active" || subscription.status === "trialing");
  const topupRemaining = credits?.topup?.remaining ?? 0;

  return (
    <Card className={cardClass}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight text-gray-900">
          <BanknotesIcon className="h-5 w-5 text-gray-500" />
          {tBilling("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="text-3xl font-semibold tracking-tight text-gray-900">
            {tBilling.rich("creditsCount", {
              count: balance,
              balance: (chunks) => (
                <span className="bg-gradient-to-r from-[#ff6313] via-[#ff8a3d] to-[#ffb066] bg-clip-text text-transparent">
                  {chunks}
                </span>
              ),
            })}
          </p>
          {topupRemaining > 0 && (
            <p className="mt-1 text-sm text-gray-500">
              {tBilling("topupCount", { count: topupRemaining })}
            </p>
          )}
          <p className="mt-1 text-sm text-gray-500">
            {tBilling("creditsHelp")}
          </p>
        </div>

        <div className="flex flex-col gap-4 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-gray-900">
              {tBilling("planLabel", {
                plan: subscription?.planName ?? tBilling("freePlan"),
              })}
            </p>
            <p className="text-sm text-gray-500">
              {hasActiveSubscription
                ? subscription!.status === "trialing"
                  ? tBilling("trialPeriod")
                  : tBilling("billedMonthly")
                : tBilling("noSubscription")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasActiveSubscription ? (
              <form action={customerPortalAction}>
                <Button
                  type="submit"
                  variant="outline"
                  className="h-9 rounded-full border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                >
                  {tBilling("manageSubscription")}
                </Button>
              </form>
            ) : (
              <Button
                asChild
                variant="outline"
                className="h-9 rounded-full border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
              >
                <Link href="/pricing">{tBilling("subscribe")}</Link>
              </Button>
            )}
            <Button
              asChild
              className="h-9 rounded-full bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
            >
              <Link href="/pricing">
                <CreditCardIcon className="h-4 w-4" />
                {tBilling("pricingAndTopups")}
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentsPageContent() {
  const tPayments = useTranslations("dashboard.payments");
  const tBilling = useTranslations("dashboard.billing");
  const searchParams = useSearchParams();
  const topupSuccess = searchParams.get("topup") === "1";

  useEffect(() => {
    if (!topupSuccess) return;
    mutate("/api/billing");
    const t = setTimeout(() => mutate("/api/billing"), 2000);
    return () => clearTimeout(t);
  }, [topupSuccess]);

  return (
    <section className="flex-1 px-4 py-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            {tPayments("title")}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{tPayments("subtitle")}</p>
        </div>
        {topupSuccess && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50/80 px-4 py-3 text-sm text-green-800 backdrop-blur">
            <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            <div>
              <p className="font-medium">{tBilling("paymentSuccess")}</p>
              <p className="text-green-700/80">
                {tBilling("paymentSuccessHelp")}
              </p>
            </div>
          </div>
        )}
        <BillingCard />
      </div>
    </section>
  );
}

function PaymentsPageFallback() {
  const tPayments = useTranslations("dashboard.payments");
  return (
    <section className="flex-1 px-4 py-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            {tPayments("title")}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{tPayments("subtitle")}</p>
        </div>
        <BillingSkeleton />
      </div>
    </section>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense fallback={<PaymentsPageFallback />}>
      <PaymentsPageContent />
    </Suspense>
  );
}
