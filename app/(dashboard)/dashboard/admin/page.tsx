import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser } from "@/lib/db/queries";
import { LightBulbIcon } from "@heroicons/react/24/outline";

const adminTools = [
  {
    title: "Inspirations",
    description: "Manage hero inspiration records for generation.",
    href: "/dashboard/admin/inspirations",
    icon: LightBulbIcon,
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
    <section className="flex-1 px-4 py-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6 space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">
            Internal tools for superadmins. Select a module to continue.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {adminTools.map((tool) => {
            const Icon = tool.icon;
            const baseClasses =
              "block rounded-xl border border-border/70 bg-background px-5 py-4 transition-colors";

            const content = (
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <h2 className="text-[22px] font-semibold leading-none tracking-tight">
                    {tool.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {tool.description}
                  </p>
                </div>

                <span className="rounded-md border border-border/70 bg-muted/20 p-1.5">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </span>
              </div>
            );

            if (!tool.enabled) {
              return (
                <div
                  key={tool.title}
                  className={`${baseClasses} cursor-not-allowed opacity-95`}
                >
                  {content}
                </div>
              );
            }

            return (
              <Link
                key={tool.title}
                href={tool.href}
                className={`${baseClasses} hover:border-primary/40 hover:bg-muted/15`}
              >
                {content}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
