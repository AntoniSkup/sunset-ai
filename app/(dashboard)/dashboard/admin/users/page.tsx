import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { getUser, listAdminUsers } from "@/lib/db/queries";
import {
  AdminUsersTable,
  type AdminUserTableRow,
} from "./users-table";

export default async function AdminUsersPage() {
  const user = await getUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (user.role !== "superadmin") {
    redirect("/dashboard");
  }

  const rows = await listAdminUsers();
  const tableRows: AdminUserTableRow[] = rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAtIso: row.createdAt.toISOString(),
    lastMessageAtIso: row.lastMessageAt
      ? row.lastMessageAt.toISOString()
      : null,
    planName: row.planName,
    chatCount: row.chatCount,
    messageCount: row.messageCount,
  }));

  const numberFormatter = new Intl.NumberFormat("en-US");

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
            Users
          </h1>
          <p className="text-sm text-muted-foreground">
            Browse all{" "}
            <span className="font-medium text-foreground">
              {numberFormatter.format(tableRows.length)}
            </span>{" "}
            registered users with their plan and activity at a glance.
          </p>
        </div>
      </div>

      <AdminUsersTable rows={tableRows} />
    </section>
  );
}
