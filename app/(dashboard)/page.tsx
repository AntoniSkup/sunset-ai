"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import TextareaAutosize from "react-textarea-autosize";
import { motion, useReducedMotion, type Variants } from "motion/react";
import {
  ArrowPathIcon,
  ArrowRightIcon,
  BoltIcon,
  ChatBubbleLeftRightIcon,
  PaintBrushIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

import { Button } from "@/components/ui/button";
import { BorderBeam } from "@/components/ui/border-beam";
import TypingText from "@/components/ui/typewriter";
import { SunsetLogoMenu } from "@/components/nav/sunset-logo-menu";
import sunsetLogoTree from "@/components/icons/sunset_logo_tree.png";
import type { User } from "@/lib/db/schema";

export const STARTER_PROMPT_KEY = "landing-starter-prompt";

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
    label: "Local restaurant",
    prompt:
      "Make a website for my restaurant with the menu, opening hours, photo gallery, and reservations.",
  },
  {
    label: "Wedding photographer",
    prompt:
      "Make a romantic portfolio for my wedding photography with a gallery and inquiry form.",
  },
];

const HOW_IT_WORKS = [
  {
    icon: ChatBubbleLeftRightIcon,
    title: "Describe it",
    desc: "Tell Sunset what you want — your business, the vibe, the sections you need.",
  },
  {
    icon: PaintBrushIcon,
    title: "We design it",
    desc: "Sunset ships a beautiful, on-brand site in seconds, ready to refine.",
  },
  {
    icon: BoltIcon,
    title: "You ship it",
    desc: "Iterate by chat, drop in your assets, and publish when you're ready.",
  },
];

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

export default function HomePage() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const [input, setInput] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: user } = useSWR<User>("/api/user", fetcher);
  const isAuthed = !!user?.id;

  const [isScrolled, setIsScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const submitPrompt = (raw: string) => {
    const message = raw.trim();
    if (!message || isLoading) return;
    setIsLoading(true);
    try {
      window.localStorage.setItem(STARTER_PROMPT_KEY, message);
    } catch {
      // localStorage may be unavailable; the destination still works.
    }
    router.push(isAuthed ? "/start" : "/sign-up?redirect=/start");
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    submitPrompt(input);
  };

  const handleSuggestion = (prompt: string) => {
    setInput(prompt);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

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
          <SunsetLogoMenu />
          <nav className="flex items-center gap-2">
            <Link
              href="/pricing"
              className="hidden sm:inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              Pricing
            </Link>
            {isAuthed ? (
              <Button
                asChild
                className="h-9 rounded-full bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
              >
                <Link href="/start">
                  Open app
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
                  <Link href="/sign-in">Log in</Link>
                </Button>
                <Button
                  asChild
                  className="h-9 rounded-full bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
                >
                  <Link href="/sign-up">
                    Get started
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
              Build a website by chatting
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
                className="text-balance text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl [transform:translateZ(0)]"
              >
                Your website,
                <br className="hidden sm:block" />{" "}
                <span className="bg-gradient-to-r from-[#ff6313] via-[#ff8a3d] to-[#ffb066] bg-clip-text text-transparent">
                  one message away.
                </span>
              </motion.h1>
              <motion.p
                variants={heroItem}
                className="mt-2 max-w-xl text-base text-gray-500 sm:text-lg"
              >
                Describe it. Sunset designs, builds, and ships it — beautifully,
                in seconds.
              </motion.p>
            </div>

            <motion.form
              variants={heroItem}
              onSubmit={handleSubmit}
              className="mt-10 w-full"
            >
              <div className="relative overflow-hidden rounded-2xl border border-gray-400/80 bg-[#ffffffe9] px-5 py-4 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.18)] transition-[box-shadow,border-color] focus-within:border-gray-900 sm:px-7 sm:py-5">
                <div className="relative min-h-[4.5rem] text-left">
                  {showPlaceholder && (
                    <div
                      className="pointer-events-none absolute inset-0 flex items-start pt-2 text-base leading-normal"
                      aria-hidden
                    >
                      <span className="text-base text-gray-400">
                        Make a website&nbsp;
                        <TypingText
                          text={[
                            "for my coffee shop.",
                            "for my freelance portfolio.",
                            "for my SaaS launch.",
                            "for my photography studio.",
                          ]}
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
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
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
                    disabled={isLoading}
                    minRows={3}
                    maxRows={8}
                    placeholder={
                      isFocused ? "Make a website for my business" : ""
                    }
                    className="relative w-full resize-none bg-transparent pt-2 text-base leading-normal text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50"
                  />
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <span className="hidden text-xs text-gray-400 sm:inline">
                    Press{" "}
                    <kbd className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-gray-500 shadow-sm">
                      Enter
                    </kbd>{" "}
                    to start
                  </span>
                  <Button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="ml-auto h-9 rounded-md bg-gray-900 px-5 text-sm text-white hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-500"
                    aria-label="Start building"
                  >
                    {isLoading ? (
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <span>START</span>
                    )}
                  </Button>
                </div>

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
              Ship a site in three steps
            </motion.h2>
            <motion.p
              variants={heroItem}
              className="mt-2 text-sm text-gray-500 sm:text-base"
            >
              No templates. No drag-and-drop. Just a conversation.
            </motion.p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {HOW_IT_WORKS.map((step, i) => (
              <motion.div
                key={step.title}
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
                    {step.title}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed text-gray-500">
                  {step.desc}
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
                  Ready to build something beautiful?
                </h2>
                <p className="mt-2 text-sm text-white/70 sm:text-base">
                  Start with a sentence. Iterate by chat. Publish when it feels
                  right.
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
                  Try the chat
                  <ArrowRightIcon className="ml-1 h-4 w-4" />
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-10 rounded-full border-white/30 bg-transparent px-5 text-sm font-medium text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href={isAuthed ? "/start" : "/sign-up"}>
                    {isAuthed ? "Open app" : "Create account"}
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        </section>

        <footer className="border-t border-gray-100 py-8 text-xs text-gray-400">
          <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
            <span>© {new Date().getFullYear()} Sunset.</span>
            <div className="flex items-center gap-4">
              <Link href="/pricing" className="hover:text-gray-700">
                Pricing
              </Link>
              <Link href="/sign-in" className="hover:text-gray-700">
                Log in
              </Link>
              <Link href="/sign-up" className="hover:text-gray-700">
                Sign up
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
