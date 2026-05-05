"use client";

import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import useSWR from "swr";
import { nanoid } from "nanoid";
import TextareaAutosize from "react-textarea-autosize";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  BoltIcon,
  ChatBubbleLeftRightIcon,
  PaintBrushIcon,
  PlusIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { BorderBeam } from "@/components/ui/border-beam";
import TypingText from "@/components/ui/typewriter";
import { BrandLogoMenu } from "@/components/nav/brand-logo-menu";
import sunsetLogoTree from "@/components/icons/sunset_logo_tree.png";
import {
  MessageAttachment,
  MessageAttachments,
} from "@/components/ai-elements/message";
import type { FileUIPart } from "ai";
import {
  dataTransferHasFilePayload,
  isAcceptedChatImageFile,
  pickAcceptedChatImageFilesFromDataTransfer,
} from "@/lib/files/chat-image-files";
import { saveLandingHandoff } from "@/lib/storage/landing-handoff";
import type { User } from "@/lib/db/schema";

type LandingAttachment = {
  localId: string;
  file: File;
  previewUrl: string;
};

const SUGGESTION_KEYS = [
  "coffee",
  "portfolio",
  "saas",
  "restaurant",
  "wedding",
] as const;

const HOW_IT_WORKS = [
  { icon: ChatBubbleLeftRightIcon, key: "describe" },
  { icon: PaintBrushIcon, key: "design" },
  { icon: BoltIcon, key: "ship" },
] as const;

const fetcher = (url: string) => fetch(url).then((res) => res.json());

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

export default function LandingPage() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const tNav = useTranslations("marketing.nav");
  const tHero = useTranslations("marketing.hero");
  const tComposer = useTranslations("marketing.composer");
  const tSuggestions = useTranslations("marketing.suggestions");
  const tSteps = useTranslations("marketing.steps");
  const tCta = useTranslations("marketing.cta");
  const tFooter = useTranslations("marketing.footer");
  const typingTexts = tComposer.raw("placeholderTyping") as string[];
  const [input, setInput] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [attachments, setAttachments] = useState<LandingAttachment[]>([]);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileDragDepthRef = useRef(0);
  const attachmentUrlsRef = useRef<string[]>([]);

  const { data: user } = useSWR<User>("/api/user", fetcher);
  const isAuthed = !!user?.id;

  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    attachmentUrlsRef.current = attachments.map((a) => a.previewUrl);
  }, [attachments]);

  useEffect(() => {
    return () => {
      for (const url of attachmentUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

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

  const submitPrompt = async (raw: string) => {
    const message = raw.trim();
    if ((!message && attachments.length === 0) || isLoading) return;
    setIsLoading(true);
    await saveLandingHandoff(
      message,
      attachments.map((a) => a.file)
    );
    router.push(isAuthed ? "/start" : "/sign-up?redirect=/start");
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void submitPrompt(input);
  };

  const handleSuggestion = (prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const canSubmit = !isLoading && (input.trim() || attachments.length > 0);

  const showPlaceholder = !input.trim() && !isFocused;

  useEffect(() => {
    if (!showPlaceholder || isLoading) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as Node;
      if (textareaRef.current?.contains(target)) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      textareaRef.current?.focus();
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setInput(e.key);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPlaceholder, isLoading]);

  return (
    <div className="relative min-h-full bg-white">
      <BackgroundDecor />

      <header
        className={`sticky top-0 z-30 transition-all duration-500 ease-out ${
          isScrolled
            ? "border-b border-gray-200/60 bg-white/65 backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-white/55"
            : "border-b border-transparent bg-transparent backdrop-blur-0"
        }`}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <BrandLogoMenu />
          <nav className="flex items-center gap-2">
            <Link
              href="/pricing"
              className="hidden sm:inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              {tNav("pricing")}
            </Link>
            {isAuthed ? (
              <Button
                asChild
                className="h-9 rounded-full bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
              >
                <Link href="/start">
                  {tNav("openApp")}
                  <ArrowRightIcon className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button
                  asChild
                  variant="ghost"
                  className="hidden sm:inline-flex h-9 rounded-full px-4 text-sm font-medium text-gray-700 hover:bg-white"
                >
                  <Link href="/sign-in">{tNav("logIn")}</Link>
                </Button>
                <Button
                  asChild
                  className="h-9 rounded-full bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
                >
                  <Link href="/sign-up">
                    {tNav("getStarted")}
                    <ArrowRightIcon className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <section className="relative pt-16 pb-20 sm:pt-24 md:pt-28">
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
              <SparklesIcon className="h-3.5 w-3.5 text-gray-900" />
              {tHero("badge")}
            </motion.div>

            <div className="flex flex-col items-center gap-3">
              <motion.div variants={heroItem}>
                <Image
                  src={sunsetLogoTree}
                  alt={tHero("logoAlt")}
                  width={48}
                  height={48}
                  priority
                  className="h-12 w-12 select-none drop-shadow-sm"
                  draggable={false}
                />
              </motion.div>
              <motion.h1
                variants={heroItem}
                className="text-balance text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl [transform:translateZ(0)]"
              >
                {tHero("titleLine1")}
                <br className="hidden sm:block" />{" "}
                <span className="bg-gradient-to-r from-[#ff6313] via-[#ff8a3d] to-[#ffb066] bg-clip-text text-transparent">
                  {tHero("titleLine2")}
                </span>
              </motion.h1>
              <motion.p
                variants={heroItem}
                className="mt-2 max-w-xl text-base text-gray-500 sm:text-lg"
              >
                {tHero("subtitle")}
              </motion.p>
            </div>

            <motion.form
              variants={heroItem}
              onSubmit={handleSubmit}
              className="mt-10 w-full"
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
                      {tComposer("dropTitle")}
                    </span>
                    <span className="text-xs text-gray-500">
                      {tComposer("dropHint")}
                    </span>
                  </div>
                )}

                <div className="relative min-h-[4.5rem] text-left">
                  {showPlaceholder && (
                    <div
                      className="pointer-events-none absolute inset-0 flex items-start pt-2 text-base leading-normal"
                      aria-hidden
                    >
                      <span className="text-base text-gray-400">
                        {tComposer("placeholderPrefix")}&nbsp;
                        <TypingText
                          text={typingTexts}
                          pauseDuration={2500}
                          typingSpeed={32}
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
                    disabled={isLoading}
                    minRows={3}
                    maxRows={8}
                    placeholder={
                      isFocused ? tComposer("placeholderFocused") : ""
                    }
                    className="relative w-full resize-none bg-transparent pt-2 text-base leading-normal text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50"
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
                    aria-label={tComposer("attachImages")}
                    title={tComposer("attachImages")}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>

                  <span className="hidden flex-1 text-xs text-gray-400 sm:inline">
                    {tComposer.rich("enterHint", {
                      key: (chunks) => (
                        <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-gray-500 shadow-sm">
                          {chunks}
                        </kbd>
                      ),
                    })}
                  </span>
                  <Button
                    type="submit"
                    disabled={!canSubmit}
                    className="h-9 rounded-md bg-gray-900 px-5 text-sm text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500"
                    aria-label={tComposer("startLabel")}
                  >
                    {isLoading ? (
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <span>{tComposer("start")}</span>
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
                  <BorderBeam
                    duration={22}
                    size={240}
                    className="from-transparent via-gray-900 to-transparent"
                  />
                )}
              </div>

              <motion.div
                variants={heroItem}
                className="mt-5 flex flex-wrap items-center justify-center gap-2"
              >
                {SUGGESTION_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      handleSuggestion(tSuggestions(`${key}.prompt`))
                    }
                    className="group inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-gray-700 backdrop-blur transition-[color,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-gray-900 hover:text-gray-900 active:translate-y-0"
                  >
                    <SparklesIcon className="h-3 w-3 text-gray-400 transition-colors group-hover:text-[#ff6313]" />
                    {tSuggestions(`${key}.label`)}
                  </button>
                ))}
              </motion.div>
            </motion.form>
          </motion.div>
        </section>

        <motion.section
          variants={heroContainer}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="pb-20"
        >
          <div className="mb-10 text-center">
            <motion.h2
              variants={heroItem}
              className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl"
            >
              {tSteps("title")}
            </motion.h2>
            <motion.p
              variants={heroItem}
              className="mt-2 text-sm text-gray-500 sm:text-base"
            >
              {tSteps("subtitle")}
            </motion.p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {HOW_IT_WORKS.map((step, i) => (
              <motion.div
                key={step.key}
                variants={heroItem}
                className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white/80 p-6 backdrop-blur transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_12px_40px_-16px_rgba(15,23,42,0.18)]"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900 text-white transition-transform duration-200 group-hover:scale-105">
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="text-xs font-mono text-gray-400">
                    0{i + 1}
                  </span>
                  <h3 className="text-base font-semibold text-gray-900">
                    {tSteps(`${step.key}.title`)}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-gray-500">
                  {tSteps(`${step.key}.desc`)}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <section className="pb-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-3xl border border-gray-900/90 bg-gray-900 px-6 py-12 text-white sm:px-12 sm:py-16"
          >
            <div className="absolute inset-0 -z-10 opacity-60 [background:radial-gradient(80%_120%_at_50%_0%,rgba(255,99,19,0.35),transparent_60%),radial-gradient(60%_120%_at_100%_100%,rgba(255,138,61,0.25),transparent_60%)]" />
            <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl">
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  {tCta("title")}
                </h2>
                <p className="mt-2 text-sm text-white/70 sm:text-base">
                  {tCta("subtitle")}
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-3 sm:w-auto">
                <Button
                  type="button"
                  onClick={() => {
                    textareaRef.current?.focus();
                    textareaRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                  }}
                  className="h-10 rounded-full bg-white px-5 text-sm font-medium text-gray-900 hover:bg-white/90"
                >
                  {tCta("tryChat")}
                  <ArrowRightIcon className="ml-1 h-4 w-4" />
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-10 rounded-full border-white/30 bg-transparent px-5 text-sm font-medium text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href={isAuthed ? "/start" : "/sign-up"}>
                    {isAuthed ? tCta("openApp") : tCta("createAccount")}
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </section>

        <footer className="border-t border-gray-100 py-8 text-xs text-gray-400">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <span>
              {tFooter("copyright", { year: new Date().getFullYear() })}
            </span>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/pricing" className="hover:text-gray-700">
                {tFooter("pricing")}
              </Link>
              <Link href="/privacy" className="hover:text-gray-700">
                {tFooter("privacy")}
              </Link>
              <Link href="/terms" className="hover:text-gray-700">
                {tFooter("terms")}
              </Link>
              <Link href="/sign-in" className="hover:text-gray-700">
                {tFooter("login")}
              </Link>
              <Link href="/sign-up" className="hover:text-gray-700">
                {tFooter("signup")}
              </Link>
              <LanguageSwitcher />
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
      <div className="absolute inset-0 [background:radial-gradient(60%_50%_at_50%_-10%,rgba(255,138,61,0.18),transparent_70%),radial-gradient(40%_30%_at_85%_15%,rgba(255,99,19,0.12),transparent_70%)]" />
      <div
        className="landing-orb-a absolute -top-40 left-1/2 h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(255,176,102,0.45),transparent)] opacity-90 [filter:blur(80px)] [transform:translate3d(-50%,0,0)] [will-change:transform]"
        style={{ animation: "landing-orb-a 22s ease-in-out infinite" }}
      />
      <div
        className="landing-orb-b absolute right-[-12%] top-2/3 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(255,176,102,0.32),transparent)] opacity-80 [filter:blur(80px)] [transform:translate3d(0,0,0)] [will-change:transform]"
        style={{ animation: "landing-orb-b 28s ease-in-out infinite" }}
      />
      <div className="absolute inset-0 [background-image:linear-gradient(to_bottom,transparent,white_85%)]" />
    </div>
  );
}
