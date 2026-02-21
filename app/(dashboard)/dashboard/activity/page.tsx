import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium text-gray-900 mb-6">
        Activity Log
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length > 0 ? (
            <ul className="space-y-4">
              {logs.map((log) => {
                const Icon = iconMap[log.action as ActivityType] || Cog6ToothIcon;
                const formattedAction = formatAction(
                  log.action as ActivityType,
                );

                return (
                  <li key={log.id} className="flex items-center space-x-4">
                    <div className="bg-orange-100 rounded-full p-2">
                      <Icon className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {formattedAction}
                        {log.ipAddress && ` from IP ${log.ipAddress}`}
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
            <div className="flex flex-col items-center justify-center text-center py-12">
              <ExclamationCircleIcon className="h-12 w-12 text-orange-500 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No activity yet
              </h3>
              <p className="text-sm text-gray-500 max-w-sm">
                When you perform actions like signing in or updating your
                account, they'll appear here.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
