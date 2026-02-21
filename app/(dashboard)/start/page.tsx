"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { nanoid } from "nanoid";
import { usePendingMessageStore } from "@/lib/stores/usePendingMessageStore";
import TextareaAutosize from "react-textarea-autosize";
import {
  PlusIcon,
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
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

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

export default function StartPage() {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [chats, setChats] = useState<Chat[]>([]);
  const router = useRouter();
  const setPendingMessage = usePendingMessageStore((s) => s.setPendingMessage);

  useEffect(() => {
    const fetchChats = async () => {
      try {
        const response = await fetch("/api/chats");
        if (response.ok) {
          const data = await response.json();
          setChats(data.chats ?? []);
        }
      } catch (error) {
        console.error("Error fetching chats:", error);
      }
    };
    fetchChats();
  }, []);

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
    <div
      className="min-h-full overflow-y-auto relative"
      style={{
        // backgroundImage: "url(/mesh-gradient-4.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundAttachment: "fixed",
      }}
    >
      <header className="sticky top-0 z-10 flex items-center h-12 justify-start w-full px-4 sm:px-6 bg-white/80 backdrop-blur-sm border-b border-gray-200/50 px-4 sm:px-6 lg:px-8">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center transition-transform duration-200 ease-out hover:scale-110 focus:outline-none focus:ring-2 focus:ring-gray-300 rounded"
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
              <Link href="/start" className="flex items-center cursor-pointer">
                <HomeIcon className="mr-2 h-4 w-4" />
                Home
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/pricing" className="flex items-center cursor-pointer">
                <CreditCardIcon className="mr-2 h-4 w-4" />
                Preview payment
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/general" className="flex items-center cursor-pointer">
                <Cog6ToothIcon className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="relative flex flex-col min-h-full">
        <div className="flex flex-col items-center justify-center pt-32 sm:pt-40 md:pt-48 pb-12 px-4">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight text-center text-black"
          >
            What do you want to make?
          </motion.h1>

          <form onSubmit={handleSubmit} className="w-full max-w-2xl mt-8">
            <div className="relative flex items-center gap-3 rounded-2xl bg-white border border-gray-200 shadow-sm px-4 py-3 min-h-[56px]">
              <button
                type="button"
                className="flex-shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Add attachment"
              >
                <PlusIcon className="h-5 w-5" />
              </button>
              <TextareaAutosize
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!isLoading && input.trim()) {
                      (e.target as HTMLTextAreaElement).form?.requestSubmit();
                    }
                  }
                }}
                placeholder="Describe your idea. Attach a design to guide the result."
                disabled={isLoading}
                maxRows={10}
                className={cn(
                  "flex-1 min-w-0 bg-transparent text-gray-900 text-sm resize-none overflow-auto",
                  "focus:outline-none placeholder:text-gray-400",
                  "disabled:opacity-50"
                )}
              />
              <Button
                type="submit"
                disabled={isLoading || !input.trim()}
                size="icon"
                className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40 disabled:bg-gray-200 disabled:text-gray-500 disabled:hover:bg-gray-200"
                aria-label="Submit"
              >
                {isLoading ? (
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowUpIcon className="h-5 w-5" />
                )}
              </Button>
            </div>
          </form>
        </div>

        <div className="px-4 sm:px-6">
          <div className="pb-16 bg-gray-50 max-w-5xl mx-auto rounded-xl">
            <div className="flex items-center justify-between px-4 sm:px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Start from an example
              </h2>
              <Link
                href="/start"
                className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                See more
              </Link>
            </div>

            <div className="px-4 sm:px-6 pb-6">
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {chats.map((chat) => (
                  <Link
                    key={chat.publicId}
                    href={`/builder/${chat.publicId}`}
                    className="group flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
                  >
                    <div className="aspect-video w-full bg-gray-100 flex items-center justify-center border-b border-gray-100 overflow-hidden">
                      {(chat.screenshotUrl ?? chat.screenshot_url) ? (
                        <img
                          src={chat.screenshotUrl ?? chat.screenshot_url ?? ""}
                          alt={chat.title || "Landing page preview"}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="text-gray-400 text-4xl font-bold">
                          {(chat.title || "U").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="p-4 flex flex-col gap-1">
                      <p className="font-medium text-gray-900 truncate">
                        {chat.title || "Untitled"}
                      </p>
                      <p className="text-sm text-gray-500">
                        Edited {getRelativeTime(chat.updatedAt)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>

              {chats.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center max-w-md mx-auto">
                  <div className="w-24 h-24 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center mb-4">
                    <span className="text-3xl font-bold text-gray-400">?</span>
                  </div>
                  <p className="text-base font-medium text-gray-500">
                    No examples yet
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    Create something above to see it here
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
