"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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
} from "@heroicons/react/24/outline";
import { CreditsSection } from "@/components/billing/credits-section";

interface ChatHeaderProps {
  chatId: string;
  chatName?: string | null;
  onRename?: (name: string) => void;
}

export function ChatHeader({ chatId, chatName, onRename }: ChatHeaderProps) {
  const t = useTranslations("builder.header");
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
      if (trimmed === (chatName || t("untitledChat"))) {
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
    [chatId, chatName, onRename, t]
  );

  const handleRenameSelect = useCallback(() => {
    setRenameValue(chatName || t("untitledChat"));
    setIsRenaming(true);
  }, [chatName, t]);

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
                alt={t("logoAlt")}
                className="w-7 h-7 shrink-0 hover:opacity-70 click:opacity-100 transition-all duration-200 cursor-pointer ease-in-out"
                aria-label={t("openMenu")}
                title={t("logoTitle")}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuItem asChild>
                <Link
                  href="/start"
                  className="flex items-center cursor-pointer"
                >
                  <ChevronLeftIcon className="h-3 w-3 font-bold text-black" />
                  {t("goToDashboard")}
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
                  {t("payment")}
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
                  {t("settings")}
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
                      {chatName || t("untitledChat")}
                    </span>
                    <span className="text-xs text-gray-500 leading-none">
                      {t("personalWorkspace")}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem onSelect={handleRenameSelect}>
                    <PencilSquareIcon className="mr-2 h-4 w-4" />
                    {t("renameChat")}
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
