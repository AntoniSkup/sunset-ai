"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import sunsetLogo from "@/components/icons/sunset_logo_tree.png";
import {
  CreditCardIcon,
  Cog6ToothIcon,
  PencilSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import useSWR from "swr";
import type { BillingApiResponse } from "@/app/api/billing/route";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function CreditsSection() {
  const { data: billing } = useSWR<BillingApiResponse>("/api/billing", fetcher);
  if (!billing) return null;

  const { credits } = billing;
  const { daily, monthly, topup } = credits;

  // "Subscription" bucket = monthly cycle credits + persistent top-up credits.
  // Both are priority-1 grants that consume after the daily bonus, so for the
  // user they are interchangeable "non-daily" credits.
  const monthlyRemaining = monthly?.remaining ?? 0;
  const topupRemaining = topup?.remaining ?? 0;
  const subscriptionRemaining = monthlyRemaining + topupRemaining;

  const monthlyTotal = monthly?.total ?? 0;
  // Top-ups have no fixed cap, so add their remaining amount to capacity so
  // the bar reflects what the user can actually spend right now.
  const subscriptionCapacity = monthlyTotal + topupRemaining;

  const hasSubscriptionBucket = subscriptionCapacity > 0;
  const totalCapacity = daily.total + subscriptionCapacity;
  const dailyPct =
    totalCapacity > 0 ? (daily.remaining / totalCapacity) * 100 : 0;
  const subscriptionPct =
    totalCapacity > 0 && hasSubscriptionBucket
      ? (subscriptionRemaining / totalCapacity) * 100
      : 0;

  return (
    <Link
      href="/dashboard"
      className="block px-4 py-3 hover:bg-gray-50 rounded-md transition-colors -mx-1 "
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-900">Credits</span>
        <span className="text-sm text-gray-600 flex items-center gap-0.5">
          {hasSubscriptionBucket
            ? `${subscriptionRemaining} + ${daily.remaining} left`
            : `${daily.remaining} left`}
          <ChevronRightIcon className="h-4 w-4 text-gray-400" />
        </span>
      </div>
      {totalCapacity > 0 && (
        <div className="space-y-1.5 mb-2 ">
          <div className="h-3 w-full rounded-full bg-gray-200 overflow-hidden flex">
            {subscriptionPct > 0 && (
              <div
                className="h-full bg-orange-500 transition-all"
                style={{ width: `${subscriptionPct}%` }}
              />
            )}
            {dailyPct > 0 && (
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${dailyPct}%` }}
              />
            )}
          </div>
        </div>
      )}
      <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-2">
        <span className="size-1.5 rounded-full bg-gray-400" />
        Daily credits reset at midnight UTC
      </p>
    </Link>
  );
}

interface ChatHeaderProps {
  chatId: string;
  chatName?: string | null;
  onRename?: (name: string) => void;
}

export function ChatHeader({ chatId, chatName, onRename }: ChatHeaderProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isRenaming]);

  const saveRename = useCallback(
    async (newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed) {
        setIsRenaming(false);
        return;
      }
      if (trimmed === (chatName || "Untitled Chat")) {
        setIsRenaming(false);
        return;
      }
      setIsSaving(true);
      try {
        const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: trimmed }),
        });
        if (res.ok) {
          onRename?.(trimmed);
          setIsRenaming(false);
        }
      } finally {
        setIsSaving(false);
      }
    },
    [chatId, chatName, onRename]
  );

  const handleRenameSelect = useCallback(() => {
    setRenameValue(chatName || "Untitled Chat");
    setIsRenaming(true);
  }, [chatName]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveRename(renameValue);
      } else if (e.key === "Escape") {
        setIsRenaming(false);
      }
    },
    [renameValue, saveRename]
  );

  const handleInputBlur = useCallback(() => {
    saveRename(renameValue);
  }, [renameValue, saveRename]);

  return (
    <header className="h-12 ">
      <div className="h-full px-4 sm:px-6 lg:px-8 flex justify-between items-center">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <img
                src={sunsetLogo.src}
                alt="Sunset logo "
                className="w-7 h-7 shrink-0 hover:opacity-70 click:opacity-100 transition-all duration-200 cursor-pointer ease-in-out"
                aria-label="Open menu"
                title="Sunset logo"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem asChild>
                <Link
                  href="/start"
                  className="flex items-center cursor-pointer"
                >
                  <ChevronLeftIcon className="h-3 w-3 font-bold text-black" />
                  Go to Dashboard
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />

              <CreditsSection />
              {/* <DropdownMenuSeparator /> TODO ADD HERE A GET FREE CREDITS BUTTON */}

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link
                  href="/pricing"
                  className="flex items-center cursor-pointer"
                >
                  <CreditCardIcon
                    className="h-3 w-3 font-bold text-black"
                    strokeWidth={1.5}
                  />
                  Payment
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href="/dashboard/general"
                  className="flex items-center cursor-pointer"
                >
                  <Cog6ToothIcon
                    className="h-3 w-3 font-bold text-black"
                    strokeWidth={1.5}
                  />
                  Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="h-5 w-px bg-gray-200 flex-shrink-0" aria-hidden />

          <div className="flex-1 min-w-0 flex items-center h-9 px-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 ease-in-out">
            {isRenaming ? (
              <Input
                ref={inputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={handleInputKeyDown}
                onBlur={handleInputBlur}
                disabled={isSaving}
                className="h-7 w-auto min-w-[8rem] max-w-64 text-sm font-medium border-0 shadow-none bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none selection:bg-[Highlight] selection:text-[HighlightText]"
              />
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="w-full flex flex-col gap-0.5 leading-none text-left min-w-0  justify-start items-start cursor-pointer"
                  >
                    <span className="text-sm font-medium text-gray-900 truncate leading-none">
                      {chatName || "Untitled Chat"}
                    </span>
                    <span className="text-xs text-gray-500 leading-none">
                      Personal workspace
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onSelect={handleRenameSelect}>
                    <PencilSquareIcon className="mr-2 h-4 w-4" />
                    Rename chat
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
