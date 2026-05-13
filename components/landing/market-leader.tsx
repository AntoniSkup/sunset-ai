"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  motion,
  useInView,
  useReducedMotion,
  type Variants,
} from "motion/react";
import {
  CheckBadgeIcon,
  DevicePhoneMobileIcon,
  PaintBrushIcon,
  SparklesIcon,
  StarIcon,
  TrophyIcon,
} from "@heroicons/react/24/solid";
import { CodeBracketSquareIcon } from "@heroicons/react/24/outline";

import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";

const sectionContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

const sectionItem: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] },
  },
};

function AnimatedNumber({
  to,
  duration = 1.4,
  className,
  triggerRef,
}: {
  to: number;
  duration?: number;
  className?: string;
  triggerRef: React.RefObject<HTMLElement | null>;
}) {
  const prefersReducedMotion = useReducedMotion();
  const inView = useInView(triggerRef, { once: true, margin: "-15% 0px" });
  const [value, setValue] = useState(prefersReducedMotion ? to : 0);

  useEffect(() => {
    if (!inView || prefersReducedMotion) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const elapsed = (t - start) / 1000;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(to * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration, prefersReducedMotion]);

  return <span className={className}>{value}</span>;
}

function MockBrowserChrome({ url }: { url: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-gray-200/80 bg-gray-50/80 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>
      <div className="ml-2 flex flex-1 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-[10px] font-medium text-gray-500">
        <svg
          className="h-3 w-3 text-gray-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M10 1.5a4.5 4.5 0 0 0-4.5 4.5v2A2.5 2.5 0 0 0 3 10.5v6A2.5 2.5 0 0 0 5.5 19h9a2.5 2.5 0 0 0 2.5-2.5v-6A2.5 2.5 0 0 0 14.5 8V6A4.5 4.5 0 0 0 10 1.5Zm3 6.5V6a3 3 0 1 0-6 0v2h6Z"
            clipRule="evenodd"
          />
        </svg>
        <span className="truncate">{url}</span>
      </div>
    </div>
  );
}

function DesignSpecimen() {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });

  const reveal = (delay: number) => ({
    initial: prefersReducedMotion ? false : { opacity: 0, y: 12 },
    animate:
      inView || prefersReducedMotion
        ? { opacity: 1, y: 0 }
        : { opacity: 0, y: 12 },
    transition: {
      duration: 0.55,
      delay,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  });

  return (
    <div ref={ref} className="relative">
      <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_10px_40px_-18px_rgba(15,23,42,0.25)]">
        <MockBrowserChrome url="yourbusiness.com" />

        <div className="relative h-[260px] overflow-hidden bg-white sm:h-[280px]">
          <div className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_55%_at_30%_-10%,rgba(255,138,61,0.22),transparent_60%),radial-gradient(40%_40%_at_85%_20%,rgba(255,99,19,0.16),transparent_70%)]" />
          {!prefersReducedMotion && (
            <motion.div
              aria-hidden
              className="absolute -top-10 left-1/3 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(255,138,61,0.55),transparent)] [filter:blur(28px)]"
              animate={{
                x: [0, 24, -12, 0],
                y: [0, 10, -6, 0],
              }}
              transition={{
                duration: 14,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}

          <div className="relative flex h-full flex-col gap-3 px-5 pt-6">
            <motion.div
              {...reveal(0)}
              className="h-2.5 w-20 rounded-full bg-gray-200"
            />
            <motion.div
              {...reveal(0.1)}
              className="h-5 w-[78%] rounded-md bg-gray-900"
            />
            <motion.div
              {...reveal(0.18)}
              className="h-5 w-[58%] rounded-md bg-gradient-to-r from-[#ff6313] via-[#ff8a3d] to-[#ffb066]"
            />
            <motion.div
              {...reveal(0.28)}
              className="h-2 w-[70%] rounded-full bg-gray-200"
            />
            <motion.div
              {...reveal(0.34)}
              className="h-2 w-[55%] rounded-full bg-gray-200"
            />
            <motion.div {...reveal(0.44)} className="mt-2 flex gap-2">
              <span className="h-7 w-24 rounded-md bg-gray-900" />
              <span className="h-7 w-20 rounded-md border border-gray-300" />
            </motion.div>

            <motion.div
              {...reveal(0.58)}
              className="absolute right-4 bottom-4 grid grid-cols-3 gap-1.5"
            >
              <span className="h-12 w-12 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200" />
              <span className="h-12 w-12 rounded-lg bg-gradient-to-br from-orange-100 to-orange-200" />
              <span className="h-12 w-12 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200" />
            </motion.div>
          </div>
        </div>

        {!prefersReducedMotion && (
          <BorderBeam
            duration={14}
            size={180}
            className="from-transparent via-[#ff8a3d] to-transparent"
          />
        )}
      </div>

      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 8, rotate: -6 }}
        animate={
          inView || prefersReducedMotion
            ? { opacity: 1, y: 0, rotate: -6 }
            : { opacity: 0, y: 8, rotate: -6 }
        }
        transition={{ duration: 0.6, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-none absolute -top-3 -right-3 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-900 shadow-md"
      >
        <SparklesIcon className="h-3.5 w-3.5 text-[#ff6313]" />
        <NoTemplatesLabel />
      </motion.div>
    </div>
  );
}

function NoTemplatesLabel() {
  const t = useTranslations("marketing.marketLeader.design");
  return <span>{t("badge")}</span>;
}

function LighthouseDial() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });
  const prefersReducedMotion = useReducedMotion();

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const target = 100;
  const offsetTarget = circumference * (1 - target / 100);

  return (
    <div ref={ref} className="relative inline-flex items-center justify-center">
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx="60"
          cy="60"
          r={radius}
          stroke="rgba(15,23,42,0.06)"
          strokeWidth="8"
          fill="none"
        />
        <motion.circle
          cx="60"
          cy="60"
          r={radius}
          stroke="url(#dial-gradient)"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          initial={
            prefersReducedMotion
              ? { strokeDashoffset: offsetTarget }
              : { strokeDashoffset: circumference }
          }
          animate={
            inView || prefersReducedMotion
              ? { strokeDashoffset: offsetTarget }
              : { strokeDashoffset: circumference }
          }
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />
        <defs>
          <linearGradient
            id="dial-gradient"
            x1="0"
            y1="0"
            x2="120"
            y2="120"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#ff6313" />
            <stop offset="60%" stopColor="#ff8a3d" />
            <stop offset="100%" stopColor="#ffb066" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatedNumber
          to={target}
          triggerRef={ref}
          className="text-3xl font-bold tracking-tight text-gray-900 tabular-nums"
        />
        <span className="-mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
          <ExcellentLabel />
        </span>
      </div>
    </div>
  );
}

function ExcellentLabel() {
  const t = useTranslations("marketing.marketLeader.seo");
  return <>{t("excellent")}</>;
}

function MetricBar({
  label,
  score,
  triggerRef,
}: {
  label: string;
  score: number;
  triggerRef: React.RefObject<HTMLElement | null>;
}) {
  const prefersReducedMotion = useReducedMotion();
  const inView = useInView(triggerRef, { once: true, margin: "-15% 0px" });
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-24 shrink-0 text-[11px] font-medium text-gray-600">
        {label}
      </span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#ff6313] via-[#ff8a3d] to-[#ffb066]"
          initial={prefersReducedMotion ? false : { width: 0 }}
          animate={
            inView || prefersReducedMotion
              ? { width: `${score}%` }
              : { width: 0 }
          }
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <span className="w-7 text-right text-[11px] font-semibold tabular-nums text-gray-900">
        <AnimatedNumber to={score} duration={1.2} triggerRef={triggerRef} />
      </span>
    </div>
  );
}

function SeoSpecimen() {
  const t = useTranslations("marketing.marketLeader.seo");
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });
  const prefersReducedMotion = useReducedMotion();
  const metrics = [
    { key: "performance", score: 100 },
    { key: "accessibility", score: 100 },
    { key: "bestPractices", score: 100 },
    { key: "seo", score: 100 },
  ] as const;

  return (
    <div ref={ref} className="flex flex-col gap-5">
      <div className="flex items-center gap-5 rounded-xl border border-gray-200 bg-white p-4">
        <LighthouseDial />
        <div className="flex-1 space-y-2">
          {metrics.map((m) => (
            <MetricBar
              key={m.key}
              label={t(`metrics.${m.key}`)}
              score={m.score}
              triggerRef={ref}
            />
          ))}
        </div>
      </div>

      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
        animate={
          inView || prefersReducedMotion
            ? { opacity: 1, y: 0 }
            : { opacity: 0, y: 14 }
        }
        transition={{
          duration: 0.6,
          delay: 0.4,
          ease: [0.22, 1, 0.36, 1],
        }}
        className="rounded-xl border border-gray-200 bg-white p-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff6313] to-[#ffb066] text-white">
            <SparklesIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="truncate">yourbusiness.com</span>
              <span aria-hidden>›</span>
              <span className="truncate">{t("serp.breadcrumb")}</span>
            </div>
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="mt-0.5 block truncate text-sm font-medium text-[#1a0dab] hover:underline"
            >
              {t("serp.title")}
            </a>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-700">
              {Array.from({ length: 5 }).map((_, i) => (
                <StarIcon key={i} className="h-3 w-3 text-amber-400" />
              ))}
              <span className="ml-1 text-gray-500">{t("serp.rating")}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-gray-600">
              {t("serp.description")}
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function PillarCard({
  eyebrow,
  title,
  description,
  chips,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  chips: { icon: React.ComponentType<{ className?: string }>; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <motion.div
      variants={sectionItem}
      className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white/85 p-6 backdrop-blur-sm transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_18px_60px_-22px_rgba(15,23,42,0.22)] sm:p-7"
    >
      <div className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#ff6313]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#ff6313]" />
        {eyebrow}
      </div>

      <div className="mb-5">{children}</div>

      <h3 className="text-xl font-semibold tracking-tight text-gray-900">
        {title}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-500">
        {description}
      </p>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <span
            key={chip.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700"
          >
            <chip.icon className="h-3 w-3 text-[#ff6313]" />
            {chip.label}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

export function LandingMarketLeader() {
  const t = useTranslations("marketing.marketLeader");

  const designChips = [
    { icon: PaintBrushIcon, label: t("design.chips.custom") },
    { icon: SparklesIcon, label: t("design.chips.typography") },
    { icon: DevicePhoneMobileIcon, label: t("design.chips.responsive") },
  ];

  const seoChips = [
    { icon: CheckBadgeIcon, label: t("seo.chips.vitals") },
    { icon: CodeBracketSquareIcon, label: t("seo.chips.semantic") },
    { icon: SparklesIcon, label: t("seo.chips.metadata") },
  ];

  const proofChips = [
    { key: "indexed", icon: CheckBadgeIcon },
    { key: "mobile", icon: DevicePhoneMobileIcon },
    { key: "schema", icon: CodeBracketSquareIcon },
  ] as const;

  return (
    <motion.section
      variants={sectionContainer}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className="pb-20"
      aria-labelledby="market-leader-heading"
    >
      <motion.div variants={sectionItem} className="mb-10 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/70 px-3 py-1 text-xs font-medium text-gray-600 backdrop-blur">
          <TrophyIcon className="h-3.5 w-3.5 text-[#ff6313]" />
          {t("eyebrow")}
        </span>
        <h2
          id="market-leader-heading"
          className="mt-4 text-balance text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl md:text-4xl"
        >
          {t("titleLine1")}{" "}
          <span className="bg-gradient-to-r from-[#ff6313] via-[#ff8a3d] to-[#ffb066] bg-clip-text text-transparent">
            {t("titleHighlight")}
          </span>{" "}
          {t("titleLine2")}
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-500 sm:text-base">
          {t("subtitle")}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PillarCard
          eyebrow={t("design.eyebrow")}
          title={t("design.title")}
          description={t("design.description")}
          chips={designChips}
        >
          <DesignSpecimen />
        </PillarCard>

        <PillarCard
          eyebrow={t("seo.eyebrow")}
          title={t("seo.title")}
          description={t("seo.description")}
          chips={seoChips}
        >
          <SeoSpecimen />
        </PillarCard>
      </div>

      <motion.div
        variants={sectionItem}
        className="mt-6 flex flex-wrap items-center justify-center gap-2"
      >
        {proofChips.map((chip) => (
          <span
            key={chip.key}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/80 px-3 py-1.5 text-xs font-medium text-gray-700 backdrop-blur"
            )}
          >
            <chip.icon className="h-3.5 w-3.5 text-[#ff6313]" />
            {t(`proof.${chip.key}`)}
          </span>
        ))}
      </motion.div>
    </motion.section>
  );
}
