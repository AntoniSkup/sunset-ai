"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowLeftIcon,
  UsersIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  Bars3Icon,
  ArrowRightOnRectangleIcon,
  CreditCardIcon,
} from "@heroicons/react/24/outline";
import { signOut } from "@/app/(login)/actions";
import { mutate } from "swr";
import { SunsetLogoMenu } from "@/components/nav/sunset-logo-menu";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    mutate("/api/user");
    router.push("/");
  }

  const navItems = [
    { href: "/dashboard", icon: UsersIcon, label: "Team" },
    { href: "/dashboard/payments", icon: CreditCardIcon, label: "Payments" },
    { href: "/dashboard/general", icon: Cog6ToothIcon, label: "General" },
    { href: "/dashboard/activity", icon: ChartBarIcon, label: "Activity" },
    { href: "/dashboard/security", icon: ShieldCheckIcon, label: "Security" },
  ];

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-white">
      <SettingsBackgroundDecor />

      <div className="relative z-10 flex items-center justify-between border-b border-gray-200/70 bg-white/70 p-4 backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-white/55 lg:hidden">
        <div className="flex items-center gap-2">
          <SunsetLogoMenu variant="dashboard" />
          <span className="text-sm font-medium tracking-tight text-gray-900">
            Settings
          </span>
        </div>
        <Button
          className="-mr-1 h-9 w-9 rounded-full"
          variant="ghost"
          size="icon"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          <Bars3Icon className="h-5 w-5" />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={`w-64 border-r border-gray-200/70 bg-white/70 backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-white/55 lg:block ${
            isSidebarOpen ? "block" : "hidden"
          } lg:relative absolute inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <nav className="flex h-full flex-col overflow-y-auto p-4">
            <div className="mb-4 hidden items-center gap-2 lg:flex">
              <SunsetLogoMenu variant="dashboard" />
              <span className="text-sm font-medium tracking-tight text-gray-900">
                Settings
              </span>
            </div>

            <div className="flex-1 space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link key={item.href} href={item.href} passHref>
                    <Button
                      variant="ghost"
                      className={`my-2 h-9 w-full justify-start rounded-full px-3 text-sm font-medium shadow-none transition-colors ${
                        isActive
                          ? "bg-gray-900 text-white hover:bg-gray-800 hover:text-white"
                          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                      onClick={() => setIsSidebarOpen(false)}
                    >
                      <item.icon
                        className={`h-4 w-4 ${
                          isActive ? "text-white" : "text-gray-500"
                        }`}
                      />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
            </div>
            <div className="mt-auto space-y-1 border-t border-gray-200/70 pt-4">
              <Button
                asChild
                type="button"
                variant="ghost"
                className="h-9 w-full justify-start rounded-full px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                <Link href="/start" onClick={() => setIsSidebarOpen(false)}>
                  <ArrowLeftIcon className="h-4 w-4" />
                  Back to app
                </Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-9 w-full justify-start rounded-full px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                onClick={() => {
                  setIsSidebarOpen(false);
                  handleSignOut();
                }}
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4" />
                Log out
              </Button>
            </div>
          </nav>
        </aside>

        <main className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto p-0 lg:p-4">
          {children}
        </main>
      </div>
    </div>
  );
}

function SettingsBackgroundDecor() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-0 isolate overflow-hidden [contain:paint]"
    >
      <div className="absolute inset-0 [background:radial-gradient(50%_40%_at_15%_-10%,rgba(255,138,61,0.10),transparent_70%),radial-gradient(35%_25%_at_90%_10%,rgba(255,99,19,0.07),transparent_70%)]" />
      <div className="absolute inset-0 [background-image:linear-gradient(to_bottom,transparent,white_85%)]" />
    </div>
  );
}
