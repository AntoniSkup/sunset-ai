"use client";

import { useRouter as useNextRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";
import { signOut } from "@/app/[locale]/(login)/actions";
import { mutate } from "swr";
import useSWR from "swr";
import type { User } from "@/lib/db/schema";
import { CreditsSection } from "@/components/billing/credits-section";

type BrandLogoMenuProps = {
  variant?: "default" | "dashboard";
  className?: string;
  contentClassName?: string;
  /**
   * When true, render the credits widget at the top of the dropdown.
   * Defaults to true; pass false for menus where credits aren't relevant.
   */
  showCredits?: boolean;
};

export function BrandLogoMenu({
  variant = "default",
  className,
  contentClassName = "w-64",
  showCredits = true,
}: BrandLogoMenuProps) {
  const router = useRouter();
  // After sign-out we want to land on the bare "/" without locale prefix being
  // re-applied — use the unlocalized router for that single redirect.
  const nextRouter = useNextRouter();
  const pathname = usePathname();
  const tNav = useTranslations("dashboard.nav");
  const tCommon = useTranslations("common");
  const { data: user } = useSWR<User>("/api/user", (url: string) =>
    fetch(url).then((res) => res.json())
  );
  const isSuperadmin = user?.role === "superadmin";
  // Hide the "back to home" shortcut on the start page itself, since
  // navigating to /start from /start would be a no-op.
  const isOnStartPage = pathname === "/start";

  async function handleSignOut() {
    await signOut();
    mutate("/api/user");
    nextRouter.push("/");
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <img
          src="/stronka-logo.png"
          alt={tCommon("appName")}
          className={
            className ??
            "h-8 w-auto object-contain shrink-0 hover:opacity-70 click:opacity-100 transition-all duration-200 cursor-pointer ease-in-out"
          }
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent className={contentClassName} align="start">
        {isOnStartPage ? null : (
          <>
            <DropdownMenuItem asChild>
              <Link href="/start" className="flex items-center cursor-pointer">
                <ChevronLeftIcon className="h-3 w-3 font-bold text-black" />
                {tNav("home")}
                <DropdownMenuShortcut>⌘H</DropdownMenuShortcut>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {showCredits ? (
          <>
            <CreditsSection />
            <DropdownMenuSeparator />
          </>
        ) : null}
        {variant !== "dashboard" || isSuperadmin ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel
                className="text-gray-500 text-xs font-medium"
                onClick={() => router.push("/dashboard")}
              >
                {tNav("myAccount")}
              </DropdownMenuLabel>

              {isSuperadmin ? (
                <DropdownMenuItem
                  onClick={() => router.push("/dashboard/admin")}
                >
                  {tNav("admin")}
                </DropdownMenuItem>
              ) : null}

              {variant === "dashboard" ? null : (
                <>
                  <DropdownMenuItem onClick={() => router.push("/pricing")}>
                    {tNav("billing")}
                    <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push("/dashboard")}>
                    {tNav("settings")}
                    <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={handleSignOut}>
            {tNav("logOut")}
            <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
