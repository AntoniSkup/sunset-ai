"use client";

import { useState, FormEvent, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { nanoid } from "nanoid";
import { usePendingMessageStore } from "@/lib/stores/usePendingMessageStore";
import TextareaAutosize from "react-textarea-autosize";
import {
  ArrowUpIcon,
  ArrowPathIcon,
  HomeIcon,
  CreditCardIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import sunsetLogoTree from "@/components/icons/sunset_logo_tree.png";
import { BorderBeam } from "@/components/ui/border-beam";

type Chat = {
  id: number;
  publicId: string;
  title: string | null;
  screenshotUrl?: string | null;
  screenshot_url?: string | null;
  createdAt: string;
  updatedAt: string;
};

function getRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  if (diffInSeconds < 3600)
    return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return hours === 1 ? "an hour ago" : `${hours} hours ago`;
  }
  if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return days === 1 ? "a day ago" : `${days} days ago`;
  }
  return date.toLocaleDateString();
}

const PROJECTS_PAGE_SIZE = 12;

export default function StartPage() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(
    undefined
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const setPendingMessage = usePendingMessageStore((s) => s.setPendingMessage);

  const loadPage = useCallback(
    async (cursor: string | null | undefined) => {
      if (cursor === null) return;
      const isFirst = cursor === undefined;
      if (isFirst) {
        try {
          const response = await fetch(
            `/api/chats?limit=${PROJECTS_PAGE_SIZE}`
          );
          if (response.ok) {
            const data = await response.json();
            setChats(data.chats ?? []);
            setNextCursor(data.nextCursor ?? null);
          }
        } catch (error) {
          console.error("Error fetching chats:", error);
        }
        return;
      }
      setLoadingMore(true);
      setNextCursor(undefined);
      try {
        const response = await fetch(
          `/api/chats?cursor=${encodeURIComponent(cursor)}&limit=${PROJECTS_PAGE_SIZE}`
        );
        if (response.ok) {
          const data = await response.json();
          setChats((prev) => [...prev, ...(data.chats ?? [])]);
          setNextCursor(data.nextCursor ?? null);
        } else {
          setNextCursor(null);
        }
      } catch (error) {
        console.error("Error fetching more chats:", error);
        setNextCursor(cursor);
      } finally {
        setLoadingMore(false);
      }
    },
    []
  );

  useEffect(() => {
    loadPage(undefined);
  }, [loadPage]);

  useEffect(() => {
    if (loadingMore || nextCursor === undefined || nextCursor === null) return;
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadPage(nextCursor);
      },
      { rootMargin: "200px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nextCursor, loadPage, loadingMore]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setIsLoading(true);

    try {
      const response = await fetch("/api/chats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userQuery: message }),
      });

      if (!response.ok) {
        throw new Error("Failed to create chat");
      }

      const data = await response.json();
      const chatId = data.chat.publicId;

      setPendingMessage({
        id: nanoid(),
        chatId,
        message,
        createdAt: Date.now(),
      });

      router.push(`/builder/${chatId}`);
    } catch (error) {
      console.error("Error creating chat:", error);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="flex min-h-screen">
        <aside className="hidden md:flex w-56 shrink-0 ">
          <div className="flex h-full w-full flex-col px-3 py-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex w-fit items-center rounded px-1 py-1 transition-transform duration-200 ease-out hover:scale-105 focus:outline-none focus:ring-gray-300"
                  aria-label="Open menu"
                >
                  <img
                    src="/sunset-logo.png"
                    alt="Sunset"
                    className="h-8 w-auto object-contain"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem asChild>
                  <Link
                    href="/start"
                    className="flex items-center cursor-pointer"
                  >
                    <HomeIcon className="mr-2 h-4 w-4" />
                    Home
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/pricing"
                    className="flex items-center cursor-pointer"
                  >
                    <CreditCardIcon className="mr-2 h-4 w-4" />
                    Preview payment
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href="/dashboard/general"
                    className="flex items-center cursor-pointer"
                  >
                    <Cog6ToothIcon className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="mt-16">
              <p className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Dummy menu
              </p>
              <nav className="mt-2 space-y-1">
                {[
                  { label: "Dashboard", icon: HomeIcon },
                  { label: "Payments", icon: CreditCardIcon },
                  { label: "Settings", icon: Cog6ToothIcon },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-gray-600 transition-colors hover:bg-gray-200/70 hover:text-gray-900"
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-6 sm:px-8 md:px-12">
            <section className="flex min-h-[70vh] items-center justify-center flex-row">
              <div className="mx-auto flex w-full max-w-3xl flex-col items-start text-start">
                <div className="flex flex-row items-center justify-start">
                  <motion.img
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    src={sunsetLogoTree.src}
                    alt="Sunset"
                    className="w-10 h-10 mr-2"
                  />
                  <motion.h1
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="text-3xl font-bold tracking-tight text-gray-900 sm:text-3xl"
                  >
                    What are we creating today?
                  </motion.h1>
                </div>

                <form onSubmit={handleSubmit} className="mt-8 w-full">
                  <div className="relative min-h-[200px] rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm overflow-hidden">
                    <TextareaAutosize
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (!isLoading && input.trim()) {
                            (
                              e.target as HTMLTextAreaElement
                            ).form?.requestSubmit();
                          }
                        }
                      }}
                      placeholder="Enter your message here..."
                      disabled={isLoading}
                      minRows={5}
                      maxRows={10}
                      className="w-full resize-none overflow-auto bg-transparent pr-12 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50 h-full"
                    />
                    <Button
                      type="submit"
                      disabled={isLoading || !input.trim()}
                      size="icon"
                      className="absolute right-3 top-3 h-8 w-8 rounded-full bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500"
                      aria-label="Submit"
                    >
                      {isLoading ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUpIcon className="h-4 w-4" />
                      )}
                    </Button>
                    {/* <BorderBeam
                      duration={12}
                      size={200}
                      className="from-transparent via-gray-900 to-transparent"
                    />
                    <BorderBeam
                      duration={12}
                      delay={6}
                      size={200}
                      className="from-transparent via-gray-900 to-transparent"
                    /> */}
                  </div>
                </form>
              </div>
            </section>

            <section className="mx-auto w-full max-w-5xl pb-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">
                  Your projects
                </h2>
                <Link
                  href="/start"
                  className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
                >
                  See more
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {chats.map((chat) => (
                  <Link
                    key={chat.publicId}
                    href={`/builder/${chat.publicId}`}
                    className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
                  >
                    <div className="aspect-video w-full overflow-hidden border-b border-gray-100 bg-gray-100">
                      {(chat.screenshotUrl ?? chat.screenshot_url) ? (
                        <img
                          src={chat.screenshotUrl ?? chat.screenshot_url ?? ""}
                          alt={chat.title || "Landing page preview"}
                          className="h-full w-full object-cover object-top"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-4xl font-bold text-gray-400">
                          {(chat.title || "U").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 p-4">
                      <p className="truncate font-medium text-gray-900">
                        {chat.title || "Untitled"}
                      </p>
                      <p className="text-sm text-gray-500">
                        Edited {getRelativeTime(chat.updatedAt)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              {(nextCursor != null || loadingMore) && (
                <div
                  ref={loadMoreRef}
                  className="flex justify-center py-8"
                  aria-hidden
                >
                  {loadingMore && (
                    <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
                  )}
                </div>
              )}

              {chats.length === 0 && (
                <div className="mx-auto flex max-w-md flex-col items-center justify-center py-16 text-center">
                  <div className="mb-4 flex h-24 w-24 items-center justify-center rounded-xl border border-gray-200 bg-gray-100">
                    <span className="text-3xl font-bold text-gray-400">?</span>
                  </div>
                  <p className="text-base font-medium text-gray-500">
                    No projects yet
                  </p>
                  <p className="mt-1 text-sm text-gray-400">
                    Create something above to see it here
                  </p>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
