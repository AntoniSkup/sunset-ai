"use client";

import Link from "next/link";
import useSWR from "swr";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import type { BillingApiResponse } from "@/app/api/billing/route";

// Throw on non-2xx so SWR keeps `data` undefined on auth failures (e.g. 401
// when the session cookie is present but `getUser()` can't resolve a user).
// Without this, the fetcher resolves to `{ error: "..." }`, which is truthy
// and would make a bare `!billing` guard pass through to a crashing
// destructure of `billing.credits`.
const fetcher = async (url: string): Promise<BillingApiResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load billing: ${res.status}`);
  }
  return (await res.json()) as BillingApiResponse;
};

type CreditsSectionProps = {
  /** Where the section links to when clicked. Defaults to /dashboard. */
  href?: string;
  className?: string;
};

/**
 * Compact credits widget used inside dropdown menus.
 * Shows a single line "X + Y left" (subscription+topup, then daily) with a
 * two-segment progress bar. Designed to fit ~256px wide containers.
 *
 * Reads from /api/billing via SWR; renders nothing until data is loaded so
 * the parent menu doesn't flash.
 */
export function CreditsSection({
  href = "/dashboard",
  className = "block px-4 py-3 hover:bg-gray-50 rounded-md transition-colors -mx-1",
}: CreditsSectionProps) {
  const { data: billing } = useSWR<BillingApiResponse>("/api/billing", fetcher);
  // Guard against both the loading state (`billing` undefined) and any
  // unexpected payload shape (e.g. an error body that slipped past the
  // fetcher) so an unauthenticated/transient failure can't crash the whole
  // tree by trying to destructure `daily` off of `undefined`.
  if (!billing?.credits) return null;

  const { daily, monthly, topup } = billing.credits;

  // "Subscription" bucket = monthly cycle credits + persistent top-up credits.
  // Both are priority-1 grants that consume after the daily bonus, so for the
  // user they are interchangeable "non-daily" credits.
  const monthlyRemaining = monthly?.remaining ?? 0;
  const topupRemaining = topup?.remaining ?? 0;
  const subscriptionRemaining = monthlyRemaining + topupRemaining;

  const monthlyTotal = monthly?.total ?? 0;
  // Top-ups have no fixed cap, so add their remaining amount to capacity so
  // the bar reflects what the user can actually spend right now.
  const subscriptionCapacity = monthlyTotal + topupRemaining;

  const hasSubscriptionBucket = subscriptionCapacity > 0;
  const totalCapacity = daily.total + subscriptionCapacity;
  const dailyPct =
    totalCapacity > 0 ? (daily.remaining / totalCapacity) * 100 : 0;
  const subscriptionPct =
    totalCapacity > 0 && hasSubscriptionBucket
      ? (subscriptionRemaining / totalCapacity) * 100
      : 0;

  return (
    <Link href={href} className={className}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-900">Credits</span>
        <span className="text-sm text-gray-600 flex items-center gap-0.5">
          {hasSubscriptionBucket
            ? `${subscriptionRemaining} + ${daily.remaining} left`
            : `${daily.remaining} left`}
          <ChevronRightIcon className="h-4 w-4 text-gray-400" />
        </span>
      </div>
      {totalCapacity > 0 && (
        <div className="space-y-1.5 mb-2">
          <div className="h-3 w-full rounded-full bg-gray-200 overflow-hidden flex">
            {subscriptionPct > 0 && (
              <div
                className="h-full bg-orange-500 transition-all"
                style={{ width: `${subscriptionPct}%` }}
              />
            )}
            {dailyPct > 0 && (
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${dailyPct}%` }}
              />
            )}
          </div>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-2">
        <span className="size-1.5 rounded-full bg-gray-400" />
        Daily credits reset at midnight UTC
      </p>
    </Link>
  );
}
