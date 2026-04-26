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
  ArrowRightIcon,
  PlusIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { motion, useReducedMotion, type Variants } from "motion/react";
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
import { consumeLandingHandoff } from "@/lib/storage/landing-handoff";

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

const SUGGESTIONS: { label: string; prompt: string }[] = [
  {
    label: "Coffee shop",
    prompt:
      "Make a website for my coffee shop with a hero, menu highlights, opening hours, and a map.",
  },
  {
    label: "Freelance portfolio",
    prompt:
      "Make a sleek portfolio site for my freelance design work with a project gallery and a contact form.",
  },
  {
    label: "SaaS landing",
    prompt:
      "Make a modern SaaS landing page with hero, feature grid, pricing tiers, and an FAQ.",
  },
  {
    label: "Restaurant",
    prompt:
      "Make a website for my restaurant with the menu, opening hours, photo gallery, and reservations.",
  },
  {
    label: "Photography",
    prompt:
      "Make a minimal portfolio for my photography with a gallery and an inquiry form.",
  },
];

const heroContainer: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.05 },
  },
};

const heroItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

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
  const [uploadToast, setUploadToast] =
    useState<UploadProgressToastState | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileDragDepthRef = useRef(0);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const attachmentUrlsRef = useRef<string[]>([]);
  const uploadToastTimerRef = useRef<number | null>(null);
  const autoSubmitPendingRef = useRef(false);
  const handoffHydrationStartedRef = useRef(false);
  const router = useRouter();
  const setPendingMessage = usePendingMessageStore((s) => s.setPendingMessage);
  const prefersReducedMotion = useReducedMotion();

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

  // After the starter prompt has been hydrated into state, kick off the
  // exact same submit flow the user would have triggered manually. This
  // gives them an end-to-end "type → sign up → start building" handoff
  // without ever touching the form on /start.
  useEffect(() => {
    if (!autoSubmitPendingRef.current) return;
    if (isLoading) return;
    if (!input.trim() && attachments.length === 0) return;
    autoSubmitPendingRef.current = false;
    // Wait one frame so React has a chance to flush the focus/UI before we
    // trigger the form submit; otherwise the request may race the chats
    // fetch above and feel jumpy on slower devices.
    requestAnimationFrame(() => {
      formRef.current?.requestSubmit();
    });
  }, [input, isLoading, attachments.length]);

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

  // Pull any handoff (prompt + image files) the public landing page may have
  // stashed for us, hydrate it into local state, and arm the auto-submit
  // effect above. Guarded by a ref (instead of a cancellation flag) so that
  // React 18 Strict Mode's double effect mount in dev doesn't consume the
  // storage on pass 1, cancel pass 1, and then find nothing on pass 2.
  useEffect(() => {
    if (handoffHydrationStartedRef.current) return;
    handoffHydrationStartedRef.current = true;
    (async () => {
      const handoff = await consumeLandingHandoff();
      if (!handoff) return;
      const hasPrompt = handoff.prompt.length > 0;
      const hasFiles = handoff.files.length > 0;
      if (!hasPrompt && !hasFiles) return;
      if (hasPrompt) setInput(handoff.prompt);
      if (hasFiles) appendImageFiles(handoff.files);
      autoSubmitPendingRef.current = true;
    })();
  }, [appendImageFiles]);

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

  const handleSuggestion = (prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => textareaRef.current?.focus());
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
          throw failed.reason instanceof Error
            ? failed.reason
            : new Error("Failed to upload image.");
        }
        uploadedAttachments = settled
          .filter(
            (item): item is PromiseFulfilledResult<any> =>
              item.status === "fulfilled"
          )
          .map((item) => item.value);

        setUploadToast({
          status: "success",
          total: attachments.length,
          completed: attachments.length,
          message:
            attachments.length === 1
              ? "Upload complete."
              : "All files uploaded.",
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

  const canSubmit =
    !isLoading && (input.trim().length > 0 || attachments.length > 0);

  return (
    <div className="relative min-h-full bg-white">
      <BackgroundDecor />

      <header className="sticky top-0 z-30 border-b border-gray-200/60 bg-white/65 backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-white/55">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <SunsetLogoMenu />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/pricing"
              className="hidden h-9 items-center rounded-full px-4 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 sm:inline-flex"
            >
              Pricing
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              Settings
            </Link>
          </nav>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <section className="relative pt-12 pb-12 sm:pt-16 md:pt-20">
          <motion.div
            variants={heroContainer}
            initial="hidden"
            animate="show"
            className="mx-auto flex w-full max-w-3xl flex-col items-center text-center [transform:translateZ(0)] [will-change:transform,opacity]"
          >
            <motion.div
              variants={heroItem}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/70 px-3 py-1 text-xs font-medium text-gray-600 backdrop-blur"
            >
              <SparklesIcon className="h-3.5 w-3.5 text-[#ff6313]" />
              What are we building next?
            </motion.div>

            <div className="flex flex-col items-center gap-3">
              <motion.img
                variants={heroItem}
                src={sunsetLogoTree.src}
                alt="Sunset"
                className="h-12 w-12 select-none drop-shadow-sm"
                draggable={false}
              />
              <motion.h1
                variants={heroItem}
                className="text-balance text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl md:text-5xl [transform:translateZ(0)]"
              >
                What are we creating{" "}
                <span className="bg-gradient-to-r from-[#ff6313] via-[#ff8a3d] to-[#ffb066] bg-clip-text text-transparent">
                  today?
                </span>
              </motion.h1>
              <motion.p
                variants={heroItem}
                className="mt-2 max-w-xl text-sm text-gray-500 sm:text-base"
              >
                Describe your idea — Sunset designs, builds, and ships it in
                seconds.
              </motion.p>
            </div>

            <motion.form
              ref={formRef}
              onSubmit={handleSubmit}
              variants={heroItem}
              className="mt-8 w-full"
            >
              <div
                className={`relative overflow-hidden rounded-2xl border bg-[#ffffffe9] px-5 py-4 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.18)] transition-[box-shadow,border-color] focus-within:border-gray-900 sm:px-7 sm:py-5 ${
                  isFileDragActive
                    ? "border-gray-900 ring-2 ring-gray-900/15"
                    : "border-gray-400/80"
                }`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                {isFileDragActive && (
                  <div
                    className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-0.5 rounded-2xl border-2 border-dashed border-gray-900/35 bg-white/90 px-4 text-center"
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

                <div className="relative min-h-[4.5rem] text-left">
                  {!input.trim() && !isFocused && (
                    <div
                      className="pointer-events-none absolute inset-0 flex items-start pt-2 text-base leading-normal"
                      aria-hidden
                    >
                      <span className="text-base text-gray-400">
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
                        if (canSubmit) {
                          (
                            e.target as HTMLTextAreaElement
                          ).form?.requestSubmit();
                        }
                      }
                    }}
                    placeholder={
                      isFocused ? "Make a website for my business" : ""
                    }
                    disabled={isLoading}
                    minRows={3}
                    maxRows={10}
                    className="relative w-full resize-none overflow-auto bg-transparent pt-2 text-base leading-normal text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50"
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
                        className="size-16 shrink-0 rounded-xl"
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

                <div className="mt-2 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    aria-label="Attach images"
                    title="Attach images"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                  {/* 
                  <span className="hidden flex-1 text-xs text-gray-400 sm:inline">
                    Press{" "}
                    <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-gray-500 shadow-sm">
                      Enter
                    </kbd>{" "}
                    to send
                  </span> */}

                  <Button
                    type="submit"
                    disabled={!canSubmit}
                    className="h-9 rounded-md bg-gray-900 px-5 text-sm font-medium text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500"
                    aria-label="Send"
                  >
                    {isLoading ? (
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <span>SEND</span>
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

                {!prefersReducedMotion && (
                  <>
                    <BorderBeam
                      duration={22}
                      size={240}
                      className="from-transparent via-gray-900 to-transparent"
                    />
                    <BorderBeam
                      duration={22}
                      delay={11}
                      size={240}
                      className="from-transparent via-gray-900 to-transparent"
                    />
                  </>
                )}
              </div>

              <motion.div
                variants={heroItem}
                className="mt-5 flex flex-wrap items-center justify-center gap-2"
              >
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    onClick={() => handleSuggestion(suggestion.prompt)}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-gray-700 backdrop-blur transition-[color,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-gray-900 hover:text-gray-900 active:translate-y-0"
                  >
                    <SparklesIcon className="h-3 w-3 text-gray-400 transition-colors group-hover:text-[#ff6313]" />
                    {suggestion.label}
                  </button>
                ))}
              </motion.div>
            </motion.form>
          </motion.div>
        </section>

        <UploadProgressToast toast={uploadToast} />

        <section className="pb-16">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
                Your projects
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Pick up where you left off.
              </p>
            </div>
            {/* {!isProjectsLoading && chats.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  textareaRef.current?.focus();
                  textareaRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                }}
                className="hidden items-center gap-1.5 rounded-full border border-gray-200 bg-white/80 px-4 py-1.5 text-xs font-medium text-gray-700 backdrop-blur transition-colors hover:border-gray-900 hover:text-gray-900 sm:inline-flex"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                New project
              </button>
            )} */}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {isProjectsLoading
              ? Array.from({ length: 8 }).map((_, index) => (
                  <div
                    key={`project-skeleton-${index}`}
                    className="overflow-hidden rounded-2xl border border-gray-200 bg-white/80 shadow-sm backdrop-blur"
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
                    className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/40"
                  >
                    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white/80 shadow-sm backdrop-blur transition-[transform,box-shadow,border-color] duration-200 group-hover:-translate-y-1 group-hover:border-gray-900/80 group-hover:shadow-[0_12px_40px_-16px_rgba(15,23,42,0.18)]">
                      <div className="aspect-video w-full overflow-hidden border-b border-gray-100 bg-gray-50">
                        {(chat.screenshotUrl ?? chat.screenshot_url) ? (
                          <img
                            src={
                              chat.screenshotUrl ?? chat.screenshot_url ?? ""
                            }
                            alt={chat.title || "Landing page preview"}
                            className="h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
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
                        <p className="text-xs text-gray-500">
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
                <ArrowPathIcon className="h-6 w-6 animate-spin text-gray-400" />
              )}
            </div>
          )}

          {!isProjectsLoading && chats.length === 0 && (
            <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white/60 px-6 py-16 text-center backdrop-blur">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
                <img
                  src={sunsetLogoTree.src}
                  alt=""
                  aria-hidden
                  className="h-10 w-10 opacity-70"
                />
              </div>
              <p className="text-base font-medium text-gray-700">
                No projects yet
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Describe a website above and we'll save it here.
              </p>
              <button
                type="button"
                onClick={() => textareaRef.current?.focus()}
                className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800"
              >
                Start your first project
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </section>

        <footer className="border-t border-gray-100 py-8 text-xs text-gray-400">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <span>© {new Date().getFullYear()} Sunset.</span>
            <div className="flex items-center gap-4">
              <Link href="/pricing" className="hover:text-gray-700">
                Pricing
              </Link>
              <Link href="/dashboard" className="hover:text-gray-700">
                Settings
              </Link>
              <Link href="/privacy" className="hover:text-gray-700">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-gray-700">
                Terms
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function BackgroundDecor() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-0 isolate overflow-hidden [contain:paint]"
    >
      <div className="absolute inset-0 [background:radial-gradient(50%_40%_at_50%_-10%,rgba(255,138,61,0.14),transparent_70%),radial-gradient(35%_25%_at_88%_8%,rgba(255,99,19,0.08),transparent_70%)]" />
      <div className="absolute inset-0 [background-image:linear-gradient(to_bottom,transparent,white_85%)]" />
    </div>
  );
}
