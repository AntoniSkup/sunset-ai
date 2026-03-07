"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { customerPortalAction } from "@/lib/payments/actions";
import useSWR from "swr";
import type { BillingApiResponse } from "@/app/api/billing/route";
import { BanknotesIcon, CreditCardIcon } from "@heroicons/react/24/outline";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function BillingSkeleton() {
  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>Billing & credits</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-48 bg-gray-100 rounded" />
          <div className="h-9 w-40 bg-gray-200 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

function BillingCard() {
  const { data, isLoading } = useSWR<BillingApiResponse>("/api/billing", fetcher);

  if (isLoading || !data) {
    return <BillingSkeleton />;
  }

  const { balance, subscription } = data;
  const hasActiveSubscription =
    subscription &&
    (subscription.status === "active" || subscription.status === "trialing");

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BanknotesIcon className="h-5 w-5" />
          Billing & credits
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="text-2xl font-semibold text-gray-900">
            You have {balance} credits
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Credits are used for AI-powered code generation (e.g. create site, add section).
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2 border-t border-gray-100">
          <div>
            <p className="font-medium">
              Plan: {subscription?.planName ?? "Free"}
            </p>
            <p className="text-sm text-muted-foreground">
              {hasActiveSubscription
                ? subscription!.status === "trialing"
                  ? "Trial period"
                  : "Billed monthly"
                : "No active subscription"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasActiveSubscription ? (
              <form action={customerPortalAction}>
                <Button type="submit" variant="outline">
                  Manage subscription
                </Button>
              </form>
            ) : (
              <Button asChild variant="outline">
                <Link href="/pricing">Subscribe</Link>
              </Button>
            )}
            <Button asChild className="bg-orange-500 hover:bg-orange-600 text-white">
              <Link href="/pricing">
                <CreditCardIcon className="h-4 w-4 mr-2" />
                Pricing & top-ups
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function PaymentsPage() {
  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium text-gray-900 mb-6">
        Payments
      </h1>
      <BillingCard />
    </section>
  );
}
