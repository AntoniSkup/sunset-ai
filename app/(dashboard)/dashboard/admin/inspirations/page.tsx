import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { getUser } from "@/lib/db/queries";
import { InspirationsPanel } from "../tabs";

export default async function AdminInspirationsPage() {
  const user = await getUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (user.role !== "superadmin") {
    redirect("/dashboard");
  }

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6">
      <div className="space-y-3">
        <Button asChild variant="outline" size="sm" className="gap-2">
          <Link href="/dashboard/admin">
            <ChevronLeftIcon className="h-4 w-4" />
            Back to admin panel
          </Link>
        </Button>

        <div>
          <h1 className="text-lg lg:text-2xl font-medium">Inspirations</h1>
          <p className="text-sm text-muted-foreground">
            Create and review hero inspiration entries.
          </p>
        </div>
      </div>

      <InspirationsPanel />
    </section>
  );
}
