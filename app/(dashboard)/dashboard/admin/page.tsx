import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/db/queries";
import {
  ArrowRightIcon,
  LightBulbIcon,
  UsersIcon,
} from "@heroicons/react/24/outline";

const adminTools = [
  {
    title: "Inspirations",
    description: "Manage hero inspiration records for generation.",
    href: "/dashboard/admin/inspirations",
    icon: LightBulbIcon,
    enabled: true,
  },
  {
    title: "Users",
    description: "Browse all registered users, plans, and activity.",
    href: "/dashboard/admin/users",
    icon: UsersIcon,
    enabled: true,
  },
] as const;

export default async function AdminPage() {
  const user = await getUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (user.role !== "superadmin") {
    redirect("/dashboard");
  }

  return (
    <section className="flex flex-1 flex-col gap-8 px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
          Admin panel
        </h1>
        <p className="text-sm text-muted-foreground">
          Internal tools for superadmins. Select a module to continue.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {adminTools.map((tool) => {
          const Icon = tool.icon;
          const baseClasses =
            "group block rounded-2xl border border-gray-200 bg-white/80 backdrop-blur shadow-[0_8px_30px_-12px_rgba(15,23,42,0.08)] px-5 py-4 transition-all";

          const content = (
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold leading-none tracking-tight text-gray-900">
                  {tool.title}
                </h2>
                <p className="text-sm text-gray-500">{tool.description}</p>
              </div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#fff1e6] to-[#ffe0c4] ring-1 ring-orange-100 transition-transform duration-200 group-hover:scale-105">
                <Icon className="h-4 w-4 text-[#ff6313]" />
              </span>
            </div>
          );

          if (!tool.enabled) {
            return (
              <div
                key={tool.title}
                className={`${baseClasses} cursor-not-allowed opacity-80`}
              >
                {content}
              </div>
            );
          }

          return (
            <Link
              key={tool.title}
              href={tool.href}
              className={`${baseClasses} hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-[0_12px_40px_-16px_rgba(15,23,42,0.18)]`}
            >
              {content}
              <div className="mt-3 inline-flex items-center text-xs font-medium text-gray-500 transition-colors group-hover:text-gray-900">
                Open
                <ArrowRightIcon className="ml-1 h-3.5 w-3.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
