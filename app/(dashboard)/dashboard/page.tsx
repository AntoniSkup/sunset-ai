"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from "@/components/ui/card";
import { customerPortalAction } from "@/lib/payments/actions";
import { useActionState } from "react";
import { TeamDataWithMembers, User } from "@/lib/db/schema";
import { removeTeamMember, inviteTeamMember } from "@/app/(login)/actions";
import useSWR from "swr";
import { Suspense } from "react";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { BillingApiResponse } from "@/app/api/billing/route";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  BanknotesIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";

type ActionState = {
  error?: string;
  success?: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const cardClass =
  "mb-6 rounded-2xl border border-gray-200 bg-white/80 backdrop-blur shadow-[0_8px_30px_-12px_rgba(15,23,42,0.08)]";

function SubscriptionSkeleton() {
  return (
    <Card className={`${cardClass} h-[160px]`}>
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
          Billing & credits
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function ManageSubscription() {
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
          Billing & credits
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <p className="text-2xl font-semibold tracking-tight text-gray-900">
              You have{" "}
              <span className="bg-gradient-to-r from-[#ff6313] via-[#ff8a3d] to-[#ffb066] bg-clip-text text-transparent">
                {balance}
              </span>{" "}
              credits
            </p>
            {topupRemaining > 0 && (
              <p className="mt-1 text-sm text-gray-500">
                Including {topupRemaining} from top-ups
              </p>
            )}
          </div>
          <div className="flex flex-col items-start justify-between gap-4 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-medium text-gray-900">
                Plan: {subscription?.planName ?? "Free"}
              </p>
              <p className="text-sm text-gray-500">
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
                  <Button
                    type="submit"
                    variant="outline"
                    className="h-9 rounded-full border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                  >
                    Manage subscription
                  </Button>
                </form>
              ) : (
                <Button
                  asChild
                  variant="outline"
                  className="h-9 rounded-full border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                >
                  <Link href="/pricing">Subscribe</Link>
                </Button>
              )}
              <Button
                asChild
                className="h-9 rounded-full bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
              >
                <Link href="/dashboard/payments">
                  Payments
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
  return (
    <Card className={`${cardClass} h-[160px]`}>
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
          Team members
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
  const { data: teamData } = useSWR<TeamDataWithMembers>("/api/team", fetcher);
  const [removeState, removeAction, isRemovePending] = useActionState<
    ActionState,
    FormData
  >(removeTeamMember, {});

  const getUserDisplayName = (user: Pick<User, "id" | "name" | "email">) => {
    return user.name || user.email || "Unknown User";
  };

  if (!teamData?.teamMembers?.length) {
    return (
      <Card className={cardClass}>
        <CardHeader>
          <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
            Team members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">No team members yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cardClass}>
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
          Team members
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
                    {isRemovePending ? "Removing..." : "Remove"}
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {removeState?.error && (
          <p className="mt-4 text-sm text-red-500">{removeState.error}</p>
        )}
      </CardContent>
    </Card>
  );
}

function InviteTeamMemberSkeleton() {
  return (
    <Card className={`${cardClass} h-[260px]`}>
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
          Invite team member
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

function InviteTeamMember() {
  const { data: user } = useSWR<User>("/api/user", fetcher);
  const isOwner = user?.role === "owner";
  const [inviteState, inviteAction, isInvitePending] = useActionState<
    ActionState,
    FormData
  >(inviteTeamMember, {});

  return (
    <Card className={cardClass}>
      <CardHeader>
        <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
          Invite team member
        </CardTitle>
        <CardDescription>
          Add a teammate to collaborate on your projects.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={inviteAction} className="space-y-4">
          <div>
            <Label htmlFor="email" className="mb-2 text-sm text-gray-700">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="teammate@example.com"
              required
              disabled={!isOwner}
              className="h-10 rounded-lg border-gray-200 bg-white/70"
            />
          </div>
          <div>
            <Label className="text-sm text-gray-700">Role</Label>
            <RadioGroup
              defaultValue="member"
              name="role"
              className="mt-2 flex space-x-4"
              disabled={!isOwner}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="member" id="member" />
                <Label htmlFor="member" className="text-sm">
                  Member
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="owner" id="owner" />
                <Label htmlFor="owner" className="text-sm">
                  Owner
                </Label>
              </div>
            </RadioGroup>
          </div>
          {inviteState?.error && (
            <p className="text-sm text-red-500">{inviteState.error}</p>
          )}
          {inviteState?.success && (
            <p className="text-sm text-green-600">{inviteState.success}</p>
          )}
          <Button
            type="submit"
            className="h-10 rounded-full bg-gray-900 px-5 text-sm font-medium text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500"
            disabled={isInvitePending || !isOwner}
          >
            {isInvitePending ? (
              <>
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                Inviting...
              </>
            ) : (
              <>
                <PlusCircleIcon className="h-4 w-4" />
                Invite member
              </>
            )}
          </Button>
        </form>
      </CardContent>
      {!isOwner && (
        <CardFooter>
          <p className="text-sm text-gray-500">
            You must be a team owner to invite new members.
          </p>
        </CardFooter>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <section className="flex-1 px-4 py-6 lg:px-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            Team settings
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Manage your billing, teammates, and invitations.
          </p>
        </div>
        <Suspense fallback={<SubscriptionSkeleton />}>
          <ManageSubscription />
        </Suspense>
        <Suspense fallback={<TeamMembersSkeleton />}>
          <TeamMembers />
        </Suspense>
        <Suspense fallback={<InviteTeamMemberSkeleton />}>
          <InviteTeamMember />
        </Suspense>
      </div>
    </section>
  );
}
