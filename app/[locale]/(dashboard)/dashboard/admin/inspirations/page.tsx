import Link from "next/link";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { getUser } from "@/lib/db/queries";
import { InspirationsPanel } from "../tabs";

export default async function AdminInspirationsPage() {
  const user = await getUser();
  const locale = await getLocale();

  if (!user) {
    redirect("/sign-in", locale);
  }

  if (user.role !== "superadmin") {
    redirect("/dashboard", locale);
  }

  return (
    <section className="flex flex-1 flex-col gap-6 px-4 py-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 w-fit gap-2 text-muted-foreground hover:text-foreground"
        >
          <Link href="/dashboard/admin">
            <ChevronLeftIcon className="h-4 w-4" />
            Back to admin panel
          </Link>
        </Button>

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            Inspirations
          </h1>
          <p className="text-sm text-muted-foreground">
            Create and review hero inspiration entries used to ground
            generation.
          </p>
        </div>
      </div>

      <InspirationsPanel />
    </section>
  );
}
