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
import { getTranslations } from "next-intl/server";
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

const actionKeyMap: Record<ActivityType, string> = {
  [ActivityType.SIGN_UP]: "signUp",
  [ActivityType.SIGN_IN]: "signIn",
  [ActivityType.SIGN_OUT]: "signOut",
  [ActivityType.UPDATE_PASSWORD]: "updatePassword",
  [ActivityType.DELETE_ACCOUNT]: "deleteAccount",
  [ActivityType.UPDATE_ACCOUNT]: "updateAccount",
  [ActivityType.CREATE_TEAM]: "createTeam",
  [ActivityType.REMOVE_TEAM_MEMBER]: "removeTeamMember",
  [ActivityType.INVITE_TEAM_MEMBER]: "inviteTeamMember",
  [ActivityType.ACCEPT_INVITATION]: "acceptInvitation",
};

type ActivityTranslator = Awaited<
  ReturnType<typeof getTranslations<"dashboard.activity">>
>;

function getRelativeTime(date: Date, t: ActivityTranslator, locale: string) {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return t("justNow");
  if (diffInSeconds < 3600)
    return t("minutesAgo", { count: Math.floor(diffInSeconds / 60) });
  if (diffInSeconds < 86400)
    return t("hoursAgo", { count: Math.floor(diffInSeconds / 3600) });
  if (diffInSeconds < 604800)
    return t("daysAgo", { count: Math.floor(diffInSeconds / 86400) });
  return date.toLocaleDateString(locale);
}

function formatAction(action: ActivityType, t: ActivityTranslator): string {
  const key = actionKeyMap[action];
  if (!key) return t("actions.unknown");
  // Cast needed because `actions.${key}` is not statically known.
  return (t as unknown as (k: string) => string)(`actions.${key}`);
}

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [t, logs] = await Promise.all([
    getTranslations("dashboard.activity"),
    getActivityLogs(),
  ]);

  return (
    <section className="flex-1 px-4 py-6 lg:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{t("subtitle")}</p>
        </div>

        <Card className="rounded-2xl border border-gray-200 bg-white/80 backdrop-blur shadow-[0_8px_30px_-12px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-base font-semibold tracking-tight text-gray-900">
              {t("recentTitle")}
            </CardTitle>
            <CardDescription>{t("recentSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            {logs.length > 0 ? (
              <ul className="space-y-2">
                {logs.map((log) => {
                  const Icon =
                    iconMap[log.action as ActivityType] || Cog6ToothIcon;
                  const formattedAction = formatAction(
                    log.action as ActivityType,
                    t
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
                              {t("fromIp", { ip: log.ipAddress })}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          {getRelativeTime(
                            new Date(log.timestamp),
                            t,
                            locale
                          )}
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
                  {t("emptyTitle")}
                </h3>
                <p className="max-w-sm text-sm text-gray-500">
                  {t("emptyHelp")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
