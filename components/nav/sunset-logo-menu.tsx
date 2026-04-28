"use client";

import { useRouter as useNextRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
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
import { signOut } from "@/app/[locale]/(login)/actions";
import { mutate } from "swr";
import useSWR from "swr";
import type { User } from "@/lib/db/schema";
import { CreditsSection } from "@/components/billing/credits-section";

type SunsetLogoMenuProps = {
  variant?: "default" | "dashboard";
  className?: string;
  contentClassName?: string;
  /**
   * When true, render the credits widget at the top of the dropdown.
   * Defaults to true; pass false for menus where credits aren't relevant.
   */
  showCredits?: boolean;
};

export function SunsetLogoMenu({
  variant = "default",
  className,
  contentClassName = "w-64",
  showCredits = true,
}: SunsetLogoMenuProps) {
  const router = useRouter();
  // After sign-out we want to land on the bare "/" without locale prefix being
  // re-applied — use the unlocalized router for that single redirect.
  const nextRouter = useNextRouter();
  const tNav = useTranslations("dashboard.nav");
  const tCommon = useTranslations("common");
  const { data: user } = useSWR<User>("/api/user", (url: string) =>
    fetch(url).then((res) => res.json())
  );
  const isSuperadmin = user?.role === "superadmin";

  async function handleSignOut() {
    await signOut();
    mutate("/api/user");
    nextRouter.push("/");
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <img
          src="/sunset-logo.png"
          alt={tCommon("appName")}
          className={
            className ??
            "h-8 w-auto object-contain shrink-0 hover:opacity-70 click:opacity-100 transition-all duration-200 cursor-pointer ease-in-out"
          }
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent className={contentClassName} align="start">
        {showCredits ? (
          <>
            <CreditsSection />
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuLabel
            className="text-gray-500 text-xs font-medium"
            onClick={() => router.push("/dashboard")}
          >
            {tNav("myAccount")}
          </DropdownMenuLabel>

          {isSuperadmin ? (
            <DropdownMenuItem onClick={() => router.push("/dashboard/admin")}>
              {tNav("admin")}
            </DropdownMenuItem>
          ) : null}

          {variant === "dashboard" ? (
            <DropdownMenuItem onClick={() => router.push("/start")}>
              {tNav("home")}
              <DropdownMenuShortcut>⌘H</DropdownMenuShortcut>
            </DropdownMenuItem>
          ) : (
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
