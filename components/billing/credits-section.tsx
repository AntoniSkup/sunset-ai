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
 * Reads from /api/billing via SWR. While loading we render a skeleton of
 * identical height so the parent menu reserves the slot and doesn't reflow
 * the moment data arrives. On auth/fetch errors (e.g. signed-out viewer) we
 * render nothing so the menu isn't haunted by a permanent shimmer.
 */
export function CreditsSection({
  href = "/dashboard",
  className = "block px-4 py-3 hover:bg-gray-50 rounded-md transition-colors -mx-1",
}: CreditsSectionProps) {
  const { data: billing, error, isLoading } = useSWR<BillingApiResponse>(
    "/api/billing",
    fetcher
  );

  // Auth failure / fetch error: render nothing so the dropdown isn't
  // permanently haunted by a loading shimmer for unauthenticated viewers.
  if (error) return null;

  // Initial load: render a structurally identical skeleton so the parent
  // menu reserves the right height and doesn't reflow when data arrives.
  if (isLoading || !billing) {
    return (
      <Link
        href={href}
        className={className}
        aria-busy="true"
        aria-live="polite"
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-900">Credits</span>
          <span className="flex items-center gap-0.5">
            <span className="inline-block h-3.5 w-14 rounded bg-gray-200 animate-pulse" />
            <ChevronRightIcon className="h-4 w-4 text-gray-300" />
          </span>
        </div>
        <div className="space-y-1.5 mb-2">
          <div className="h-3 w-full rounded-full bg-gray-200 animate-pulse" />
        </div>
        <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-2">
          <span className="size-1.5 rounded-full bg-gray-400" />
          Daily credits reset at midnight UTC
        </p>
      </Link>
    );
  }

  // Successful response with an unexpected shape (no `credits` key): render
  // nothing rather than crash on the destructure below.
  if (!billing.credits) return null;

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
