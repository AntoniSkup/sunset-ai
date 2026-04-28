"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useDynamicTranslate } from "@/i18n/dynamic-translate";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { customerPortalAction } from "@/lib/payments/actions";
import { useActionState } from "react";
import { TeamDataWithMembers, User } from "@/lib/db/schema";
import { removeTeamMember } from "@/app/[locale]/(login)/actions";
import type { ActionState } from "@/lib/auth/middleware";
import useSWR from "swr";
import { Suspense } from "react";
import type { BillingApiResponse } from "@/app/api/billing/route";
import {
  ArrowRightIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const cardClass =
  "mb-6 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur shadow-[0_8px_30px_-12px_rgba(15,23,42,0.08)]";

function SubscriptionSkeleton() {
  const tBilling = useTranslations("dashboard.billing");
  return (
    <Card className={`${cardClass} h-[160px]`}>
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
          {tBilling("title")}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function ManageSubscription() {
  const tBilling = useTranslations("dashboard.billing");
  const { data: billing } = useSWR<BillingApiResponse>("/api/billing", fetcher);

  if (!billing) {
    return <SubscriptionSkeleton />;
  }

  const { balance, credits, subscription } = billing;
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
      <CardContent>
        <div className="space-y-4">
          <div>
            <p className="text-2xl font-semibold tracking-tight text-gray-900">
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
          </div>
          <div className="flex flex-col items-start justify-between gap-4 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
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
                <Link href="/dashboard/payments">
                  {tBilling("viewPayments")}
                  <ArrowRightIcon className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamMembersSkeleton() {
  const tTeam = useTranslations("dashboard.team");
  return (
    <Card className={`${cardClass} h-[160px]`}>
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
          {tTeam("membersTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mt-1 animate-pulse space-y-4">
          <div className="flex items-center space-x-4">
            <div className="size-8 rounded-full bg-gray-200"></div>
            <div className="space-y-2">
              <div className="h-4 w-32 rounded bg-gray-200"></div>
              <div className="h-3 w-14 rounded bg-gray-200"></div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamMembers() {
  const t = useDynamicTranslate();
  const tTeam = useTranslations("dashboard.team");
  const { data: teamData } = useSWR<TeamDataWithMembers>("/api/team", fetcher);
  const [removeState, removeAction, isRemovePending] = useActionState<
    ActionState,
    FormData
  >(removeTeamMember, {});

  const removeError = t(removeState?.errorKey, removeState?.messageParams);

  const getUserDisplayName = (user: Pick<User, "id" | "name" | "email">) => {
    return user.name || user.email || "Unknown User";
  };

  if (!teamData?.teamMembers?.length) {
    return (
      <Card className={cardClass}>
        <CardHeader>
          <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
            {tTeam("membersTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">{tTeam("noMembers")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cardClass}>
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
          {tTeam("membersTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {teamData.teamMembers.map((member, index) => (
            <li
              key={member.id}
              className="flex items-center justify-between rounded-xl border border-gray-100 bg-white/60 px-3 py-2.5"
            >
              <div className="flex items-center space-x-3">
                <Avatar className="h-9 w-9 ring-1 ring-gray-200">
                  <AvatarFallback className="bg-gray-900 text-xs font-medium text-white">
                    {getUserDisplayName(member.user)
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {getUserDisplayName(member.user)}
                  </p>
                  <p className="text-xs capitalize text-gray-500">
                    {member.role}
                  </p>
                </div>
              </div>
              {index > 1 ? (
                <form action={removeAction}>
                  <input type="hidden" name="memberId" value={member.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                    disabled={isRemovePending}
                  >
                    {isRemovePending ? tTeam("removing") : tTeam("remove")}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {removeError && (
          <p className="mt-4 text-sm text-red-500">{removeError}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const tTeam = useTranslations("dashboard.team");
  return (
    <section className="flex-1 px-4 py-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            {tTeam("title")}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{tTeam("subtitle")}</p>
        </div>
        <Suspense fallback={<SubscriptionSkeleton />}>
          <ManageSubscription />
        </Suspense>
        <Suspense fallback={<TeamMembersSkeleton />}>
          <TeamMembers />
        </Suspense>
      </div>
    </section>
  );
}
