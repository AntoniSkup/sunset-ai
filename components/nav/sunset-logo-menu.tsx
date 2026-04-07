"use client";

import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/app/(login)/actions";
import { mutate } from "swr";
import useSWR from "swr";
import type { User } from "@/lib/db/schema";

type SunsetLogoMenuProps = {
  variant?: "default" | "dashboard";
  className?: string;
  contentClassName?: string;
};

export function SunsetLogoMenu({
  variant = "default",
  className,
  contentClassName = "w-40",
}: SunsetLogoMenuProps) {
  const router = useRouter();
  const { data: user } = useSWR<User>("/api/user", (url: string) =>
    fetch(url).then((res) => res.json())
  );
  const isSuperadmin = user?.role === "superadmin";

  async function handleSignOut() {
    await signOut();
    mutate("/api/user");
    router.push("/");
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <img
          src="/sunset-logo.png"
          alt="Sunset"
          className={
            className ??
            "h-8 w-auto object-contain shrink-0 hover:opacity-70 click:opacity-100 transition-all duration-200 cursor-pointer ease-in-out"
          }
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent className={contentClassName} align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel
            className="text-gray-500 text-xs font-medium"
            onClick={() => router.push("/dashboard")}
          >
            My Account
          </DropdownMenuLabel>

          {isSuperadmin ? (
            <DropdownMenuItem onClick={() => router.push("/dashboard/admin")}>
              Admin
            </DropdownMenuItem>
          ) : null}

          {variant === "dashboard" ? (
            <DropdownMenuItem onClick={() => router.push("/start")}>
              Home
              <DropdownMenuShortcut>⌘H</DropdownMenuShortcut>
            </DropdownMenuItem>
          ) : (
            <>
              <DropdownMenuItem onClick={() => router.push("/pricing")}>
                Billing
                <DropdownMenuShortcut>⌘B</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/dashboard")}>
                Settings
                <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>Team</DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Invite users</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Email</DropdownMenuItem>
                <DropdownMenuItem>Message</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>More...</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={handleSignOut}>
            Log out
            <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
