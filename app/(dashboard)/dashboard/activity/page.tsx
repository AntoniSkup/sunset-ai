import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  UserPlusIcon,
  LockClosedIcon,
  UserCircleIcon,
  ExclamationCircleIcon,
  UserMinusIcon,
  EnvelopeIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";
import { ActivityType } from "@/lib/db/schema";
import { getActivityLogs } from "@/lib/db/queries";

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const iconMap: Record<ActivityType, IconComponent> = {
  [ActivityType.SIGN_UP]: UserPlusIcon,
  [ActivityType.SIGN_IN]: UserCircleIcon,
  [ActivityType.SIGN_OUT]: ArrowRightOnRectangleIcon,
  [ActivityType.UPDATE_PASSWORD]: LockClosedIcon,
  [ActivityType.DELETE_ACCOUNT]: UserMinusIcon,
  [ActivityType.UPDATE_ACCOUNT]: Cog6ToothIcon,
  [ActivityType.CREATE_TEAM]: UserPlusIcon,
  [ActivityType.REMOVE_TEAM_MEMBER]: UserMinusIcon,
  [ActivityType.INVITE_TEAM_MEMBER]: EnvelopeIcon,
  [ActivityType.ACCEPT_INVITATION]: CheckCircleIcon,
};

function getRelativeTime(date: Date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400)
    return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
  return date.toLocaleDateString();
}

function formatAction(action: ActivityType): string {
  switch (action) {
    case ActivityType.SIGN_UP:
      return "You signed up";
    case ActivityType.SIGN_IN:
      return "You signed in";
    case ActivityType.SIGN_OUT:
      return "You signed out";
    case ActivityType.UPDATE_PASSWORD:
      return "You changed your password";
    case ActivityType.DELETE_ACCOUNT:
      return "You deleted your account";
    case ActivityType.UPDATE_ACCOUNT:
      return "You updated your account";
    case ActivityType.CREATE_TEAM:
      return "You created a new team";
    case ActivityType.REMOVE_TEAM_MEMBER:
      return "You removed a team member";
    case ActivityType.INVITE_TEAM_MEMBER:
      return "You invited a team member";
    case ActivityType.ACCEPT_INVITATION:
      return "You accepted an invitation";
    default:
      return "Unknown action occurred";
  }
}

export default async function ActivityPage() {
  const logs = await getActivityLogs();

  return (
    <section className="flex-1 px-4 py-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            Activity log
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            A timeline of recent actions on your account.
          </p>
        </div>

        <Card className="rounded-2xl border border-gray-200 bg-white/80 backdrop-blur shadow-[0_8px_30px_-12px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
              Recent activity
            </CardTitle>
            <CardDescription>
              Showing your latest sign-ins, settings changes, and team events.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length > 0 ? (
              <ul className="space-y-2">
                {logs.map((log) => {
                  const Icon =
                    iconMap[log.action as ActivityType] || Cog6ToothIcon;
                  const formattedAction = formatAction(
                    log.action as ActivityType
                  );

                  return (
                    <li
                      key={log.id}
                      className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white/60 px-3 py-2.5 transition-colors hover:bg-white"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#fff1e6] to-[#ffe0c4] ring-1 ring-orange-100">
                        <Icon className="h-4 w-4 text-[#ff6313]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {formattedAction}
                          {log.ipAddress && (
                            <span className="text-gray-500">
                              {" "}
                              from IP {log.ipAddress}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {getRelativeTime(new Date(log.timestamp))}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#fff1e6] to-[#ffe0c4] ring-1 ring-orange-100">
                  <ExclamationCircleIcon className="h-6 w-6 text-[#ff6313]" />
                </div>
                <h3 className="mb-2 text-lg font-semibold tracking-tight text-gray-900">
                  No activity yet
                </h3>
                <p className="max-w-sm text-sm text-gray-500">
                  When you perform actions like signing in or updating your
                  account, they&apos;ll appear here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
