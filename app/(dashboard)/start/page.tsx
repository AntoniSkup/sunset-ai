"use client";

import {
  useState,
  FormEvent,
  useEffect,
  useRef,
  useCallback,
  ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { nanoid } from "nanoid";
import { usePendingMessageStore } from "@/lib/stores/usePendingMessageStore";
import TextareaAutosize from "react-textarea-autosize";
import {
  ArrowPathIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  HomeIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { motion } from "motion/react";
import sunsetLogoTree from "@/components/icons/sunset_logo_tree.png";

import { BorderBeam } from "@/components/ui/border-beam";
import TypingText from "@/components/ui/typewriter";
import { SunsetLogoMenu } from "@/components/nav/sunset-logo-menu";
import {
  MessageAttachment,
  MessageAttachments,
} from "@/components/ai-elements/message";
import type { FileUIPart } from "ai";
import {
  UploadProgressToast,
  type UploadProgressToastState,
} from "@/components/chat/upload-progress-toast";
import {
  dataTransferHasFilePayload,
  isAcceptedChatImageFile,
  pickAcceptedChatImageFilesFromDataTransfer,
} from "@/lib/files/chat-image-files";

type Chat = {
  id: number;
  publicId: string;
  title: string | null;
  screenshotUrl?: string | null;
  screenshot_url?: string | null;
  createdAt: string;
  updatedAt: string;
};

type StartAttachment = {
  localId: string;
  file: File;
  previewUrl: string;
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
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null | undefined>(
    undefined
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [attachments, setAttachments] = useState<StartAttachment[]>([]);
  const [uploadToast, setUploadToast] = useState<UploadProgressToastState | null>(
    null
  );
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileDragDepthRef = useRef(0);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const attachmentUrlsRef = useRef<string[]>([]);
  const uploadToastTimerRef = useRef<number | null>(null);
  const router = useRouter();
  const setPendingMessage = usePendingMessageStore((s) => s.setPendingMessage);

  const scheduleUploadToastHide = useCallback((delayMs: number) => {
    if (uploadToastTimerRef.current != null) {
      window.clearTimeout(uploadToastTimerRef.current);
    }
    uploadToastTimerRef.current = window.setTimeout(() => {
      setUploadToast(null);
      uploadToastTimerRef.current = null;
    }, delayMs);
  }, []);

  useEffect(() => {
    attachmentUrlsRef.current = attachments.map((a) => a.previewUrl);
  }, [attachments]);

  useEffect(() => {
    return () => {
      for (const url of attachmentUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      if (uploadToastTimerRef.current != null) {
        window.clearTimeout(uploadToastTimerRef.current);
        uploadToastTimerRef.current = null;
      }
    };
  }, []);

  const loadPage = useCallback(async (cursor: string | null | undefined) => {
    if (cursor === null) return;
    const isFirst = cursor === undefined;
    if (isFirst) {
      try {
        const response = await fetch(`/api/chats?limit=${PROJECTS_PAGE_SIZE}`);
        if (response.ok) {
          const data = await response.json();
          setChats(data.chats ?? []);
          setNextCursor(data.nextCursor ?? null);
        }
      } catch (error) {
        console.error("Error fetching chats:", error);
      } finally {
        setIsProjectsLoading(false);
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
  }, []);

  useEffect(() => {
    loadPage(undefined);
  }, [loadPage]);

  useEffect(() => {
    try {
      const STARTER_PROMPT_KEY = "landing-starter-prompt";
      const stored = window.localStorage.getItem(STARTER_PROMPT_KEY);
      if (stored && stored.trim()) {
        setInput(stored);
        window.localStorage.removeItem(STARTER_PROMPT_KEY);
        requestAnimationFrame(() => textareaRef.current?.focus());
      }
    } catch {
      // localStorage may be unavailable; ignore.
    }
  }, []);

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

  const showPlaceholder = !input.trim() && !isFocused;
  useEffect(() => {
    if (!showPlaceholder || isLoading) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as Node;
      if (textareaRef.current?.contains(target)) return;
      textareaRef.current?.focus();
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setInput(e.key);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPlaceholder, isLoading]);

  const appendImageFiles = useCallback((files: File[]) => {
    const accepted = files.filter(isAcceptedChatImageFile);
    if (accepted.length === 0) return;
    const next = accepted.map((file) => ({
      localId: nanoid(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setAttachments((prev) => [...prev, ...next]);
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    appendImageFiles(Array.from(files));
    e.target.value = "";
  };

  const resetFileDragDepth = () => {
    fileDragDepthRef.current = 0;
    setIsFileDragActive(false);
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (isLoading) return;
    const files = pickAcceptedChatImageFilesFromDataTransfer(e.clipboardData);
    if (files.length === 0) return;
    e.preventDefault();
    appendImageFiles(files);
  };

  const handleDragEnter = (e: DragEvent) => {
    if (isLoading) return;
    if (!dataTransferHasFilePayload(e.dataTransfer)) return;
    fileDragDepthRef.current += 1;
    setIsFileDragActive(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    if (!dataTransferHasFilePayload(e.dataTransfer)) return;
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1);
    if (fileDragDepthRef.current === 0) setIsFileDragActive(false);
  };

  const handleDragOver = (e: DragEvent) => {
    if (isLoading) return;
    if (!dataTransferHasFilePayload(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: DragEvent) => {
    resetFileDragDepth();
    if (isLoading) return;
    e.preventDefault();
    const files = pickAcceptedChatImageFilesFromDataTransfer(e.dataTransfer);
    if (files.length === 0) return;
    appendImageFiles(files);
  };

  const handleRemoveAttachment = (localId: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.localId === localId);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((a) => a.localId !== localId);
    });
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const message = input.trim();
    let startedUploads = false;
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

      let uploadedAttachments: Array<{
        id: number;
        alias: string;
        blobUrl: string;
        mimeType: string;
        intent: "reference" | "site_asset" | "both";
        altHint?: string | null;
        label?: string | null;
      }> = [];

      if (attachments.length > 0) {
        startedUploads = true;
        if (uploadToastTimerRef.current != null) {
          window.clearTimeout(uploadToastTimerRef.current);
          uploadToastTimerRef.current = null;
        }
        setUploadToast({
          status: "uploading",
          total: attachments.length,
          completed: 0,
        });
        const uploads = attachments.map(async (attachment) => {
          try {
            const formData = new FormData();
            formData.append("chatId", chatId);
            formData.append("file", attachment.file);
            formData.append("intent", "site_asset");

            const res = await fetch("/api/site-assets", {
              method: "POST",
              body: formData,
            });
            const uploadData = await res.json().catch(() => null);
            if (!res.ok || !uploadData?.asset) {
              throw new Error(
                uploadData?.error ||
                  `Failed to upload ${attachment.file.name || "image"}`
              );
            }
            return uploadData.asset;
          } finally {
            setUploadToast((prev) => {
              if (!prev || prev.status !== "uploading") return prev;
              return {
                ...prev,
                completed: Math.min(prev.total, prev.completed + 1),
              };
            });
          }
        });

        const settled = await Promise.allSettled(uploads);
        const failed = settled.find((item) => item.status === "rejected") as
          | PromiseRejectedResult
          | undefined;
        if (failed) {
          throw (
            failed.reason instanceof Error
              ? failed.reason
              : new Error("Failed to upload image.")
          );
        }
        uploadedAttachments = settled
          .filter((item): item is PromiseFulfilledResult<any> => item.status === "fulfilled")
          .map((item) => item.value);

        setUploadToast({
          status: "success",
          total: attachments.length,
          completed: attachments.length,
          message: attachments.length === 1 ? "Upload complete." : "All files uploaded.",
        });
        scheduleUploadToastHide(1200);
      }

      const pendingId = nanoid();

      // Kick off the turn-run BEFORE navigation so Trigger's cold start
      // overlaps with the navigation + Chat component bootstrap. On a cold
      // worker this saves ~1-2s of perceived latency; on a warm worker it
      // saves the ~200ms of client → /builder → effect → fetch round-trip.
      // If this fails for any reason we fall back to the legacy client-side
      // enqueue path by simply leaving `preEnqueued` unset.
      let preEnqueued: {
        runId: string;
        triggerRealtime: { runId: string; accessToken: string } | null;
      } | null = null;
      const parts: Array<Record<string, unknown>> = [];
      if (message) {
        parts.push({ type: "text", text: message });
      }
      for (const attachment of uploadedAttachments) {
        parts.push({
          type: "file",
          url: attachment.blobUrl,
          mediaType: attachment.mimeType,
          filename: attachment.alias,
          assetId: attachment.id,
          assetAlias: attachment.alias,
          assetIntent: attachment.intent,
          altHint: attachment.altHint ?? undefined,
          label: attachment.label ?? undefined,
        });
      }
      if (parts.length > 0) {
        try {
          const turnRes = await fetch(
            `/api/chats/${encodeURIComponent(chatId)}/turn-runs`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                payload: {
                  chatId,
                  messages: [{ role: "user", parts }],
                },
                idempotencyKey: `turn-${chatId}-${pendingId}`,
              }),
            }
          );
          if (turnRes.ok) {
            const turnData = await turnRes.json().catch(() => null);
            const runId =
              turnData?.run && typeof turnData.run.id === "string"
                ? (turnData.run.id as string)
                : null;
            const realtime =
              turnData?.triggerRealtime &&
              typeof turnData.triggerRealtime.runId === "string" &&
              typeof turnData.triggerRealtime.accessToken === "string"
                ? (turnData.triggerRealtime as {
                    runId: string;
                    accessToken: string;
                  })
                : null;
            if (runId) {
              preEnqueued = { runId, triggerRealtime: realtime };
            }
          }
        } catch {
          // Ignore and let the /builder page enqueue normally.
        }
      }

      setPendingMessage({
        id: pendingId,
        chatId,
        message,
        attachments: uploadedAttachments,
        createdAt: Date.now(),
        ...(preEnqueued ? { preEnqueued } : {}),
      });

      for (const attachment of attachments) {
        URL.revokeObjectURL(attachment.previewUrl);
      }
      setAttachments([]);
      setInput("");

      router.push(`/builder/${chatId}`);
    } catch (error) {
      console.error("Error creating chat:", error);
      if (startedUploads || uploadToast?.status === "uploading") {
        setUploadToast({
          status: "error",
          total: Math.max(attachments.length, 1),
          completed: Math.max(attachments.length, 1),
          message:
            error instanceof Error ? error.message : "Failed to upload image.",
        });
        scheduleUploadToastHide(3500);
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-6 sm:px-8 md:px-12">
      <SunsetLogoMenu />

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
            <div
              className={`relative rounded-xl border bg-[#ffffffe9] border-gray-500 px-8 py-6 overflow-hidden shadow transition-[box-shadow,border-color] ${
                isFileDragActive ? "border-gray-900 ring-2 ring-gray-900/15" : ""
              }`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {isFileDragActive && (
                <div
                  className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-0.5 rounded-xl border-2 border-dashed border-gray-900/35 bg-[#ffffff]/90 px-4 text-center"
                  aria-hidden
                >
                  <span className="text-sm font-medium text-gray-900">
                    Drop images here
                  </span>
                  <span className="text-xs text-gray-500">
                    PNG, JPG, or WebP — or paste from clipboard
                  </span>
                </div>
              )}
              <div className="relative min-h-[4.5rem]">
                {!input.trim() && !isFocused && (
                  <div
                    className="pointer-events-none absolute inset-0 flex items-start pt-2 top-[-3px] text-base leading-normal"
                    aria-hidden
                  >
                    <span className="text-base text-gray-400 leading-normal">
                      Make a website&nbsp;
                      <TypingText
                        text={[
                          "for my business.",
                          "for my freelance portfolio.",
                          "for my coffee shop.",
                        ]}
                        pauseDuration={3000}
                        typingSpeed={30}
                      />
                    </span>
                  </div>
                )}
                <TextareaAutosize
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onPaste={handlePaste}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (
                        !isLoading &&
                        (input.trim() || attachments.length > 0)
                      ) {
                        (e.target as HTMLTextAreaElement).form?.requestSubmit();
                      }
                    }
                  }}
                  placeholder={
                    isFocused ? "Make a website for my business" : ""
                  }
                  disabled={isLoading}
                  minRows={4}
                  maxRows={10}
                  className="relative w-full resize-none overflow-auto bg-transparent pt-2 text-base leading-normal text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50 h-full"
                />
              </div>
              <div
                className={`overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out ${
                  attachments.length > 0
                    ? "mt-3 max-h-28 opacity-100"
                    : "mt-0 max-h-0 opacity-0"
                }`}
              >
                <MessageAttachments className="ml-0 flex-nowrap gap-2 overflow-x-auto">
                  {attachments.map((attachment) => (
                    <MessageAttachment
                      key={attachment.localId}
                      className="size-16 rounded-xl shrink-0"
                      data={
                        {
                          type: "file",
                          url: attachment.previewUrl,
                          mediaType: attachment.file.type,
                          filename: attachment.file.name,
                        } as FileUIPart
                      }
                      onRemove={() =>
                        handleRemoveAttachment(attachment.localId)
                      }
                    />
                  ))}
                </MessageAttachments>
              </div>

              <div className="w-full flex justify-between ">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-gray-100 "
                  disabled={isLoading}
                  aria-label="Attach files"
                  title="Attach files"
                >
                  <PlusIcon className="h-4 w-4 text-black" />
                </button>
                <Button
                  type="submit"
                  disabled={
                    isLoading || (!input.trim() && attachments.length === 0)
                  }
                  size="icon"
                  className="h-8 w-16 rounded-md
 bg-gray-900 text-white   hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500 cursor-"
                  aria-label="Submit"
                >
                  {isLoading ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    // <ArrowUpIcon className="h-4 w-4" />
                    <span className="text-sm">SEND</span>
                  )}
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp"
                className="hidden"
                onChange={handleFileChange}
              />

              <BorderBeam
                duration={18}
                size={200}
                className="from-transparent via-gray-900 to-transparent"
              />
              <BorderBeam
                duration={18}
                delay={9}
                size={200}
                className="from-transparent via-gray-900 to-transparent"
              />
            </div>
          </form>
        </div>
      </section>

      <UploadProgressToast toast={uploadToast} />

      <section className="mx-auto w-full max-w-7xl pb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Your projects
          </h2>
          {/* <Link
            href="/start"
            className="text-sm font-medium text-[#ff6313] transition-colors hover:text-[#ff4a13]"
          >
            See more
          </Link> */}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isProjectsLoading
            ? Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`project-skeleton-${index}`}
                  className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
                  aria-hidden
                >
                  <div className="flex aspect-video w-full animate-pulse flex-col bg-white">
                    <div className="h-8 border-b border-gray-200 bg-gray-50" />
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="h-20 rounded-md bg-gray-100" />
                      <div className="h-3 w-2/3 rounded-full bg-gray-100" />
                      <div className="h-3 w-5/6 rounded-full bg-gray-100" />
                      <div className="h-3 w-1/2 rounded-full bg-gray-100" />
                    </div>
                  </div>
                  <div className="flex animate-pulse flex-col gap-2 p-4">
                    <div className="h-4 w-3/4 rounded-full bg-gray-100" />
                    <div className="h-3 w-1/2 rounded-full bg-gray-100" />
                  </div>
                </div>
              ))
            : chats.map((chat) => (
                <Link
                  key={chat.publicId}
                  href={`/builder/${chat.publicId}`}
                  className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                >
                  <article className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-700 bg-white shadow-sm hover:border-gray-800 hover:shadow-md">
                    <div className="aspect-video w-full overflow-hidden border-b bg-gray-100">
                      {(chat.screenshotUrl ?? chat.screenshot_url) ? (
                        <img
                          src={chat.screenshotUrl ?? chat.screenshot_url ?? ""}
                          alt={chat.title || "Landing page preview"}
                          className="h-full w-full object-cover object-top"
                        />
                      ) : (
                        <div className="flex h-full w-full animate-pulse flex-col bg-white">
                          <div className="h-8 border-b border-gray-200 bg-gray-50" />
                          <div className="flex flex-1 flex-col gap-3 p-4">
                            <div className="h-20 rounded-md bg-gray-100" />
                            <div className="h-3 w-2/3 rounded-full bg-gray-100" />
                            <div className="h-3 w-5/6 rounded-full bg-gray-100" />
                            <div className="h-3 w-1/2 rounded-full bg-gray-100" />
                          </div>
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
                  </article>
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

        {!isProjectsLoading && chats.length === 0 && (
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
  );
}
