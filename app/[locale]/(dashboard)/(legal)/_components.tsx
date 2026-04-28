import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

export async function LegalPageHeader({
  title,
  lastUpdated,
}: {
  title: string;
  lastUpdated: string;
}) {
  const t = await getTranslations("legal.header");
  return (
    <div className="mb-10">
      <span className="inline-flex items-center rounded-full border border-[#ff6313]/40 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#ff6313] backdrop-blur">
        {t("badge")}
      </span>
      <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl">
        {title}
      </h1>
      <p className="mt-3 text-sm text-gray-500">
        {t("lastUpdatedLabel", { date: lastUpdated })}
      </p>
    </div>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-gray-200/70 pt-8 first:border-t-0 first:pt-0">
      <h2 className="mb-4 text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
        {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-7 text-gray-700">
        {children}
      </div>
    </section>
  );
}

export function LegalHighlight({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 rounded-r-xl border-l-4 border-[#ff6313] bg-white/80 px-5 py-4 text-sm leading-7 text-gray-600 shadow-[0_4px_18px_-10px_rgba(15,23,42,0.12)] backdrop-blur">
      {children}
    </div>
  );
}

export function LegalList({ children }: { children: ReactNode }) {
  return (
    <ul className="ml-5 list-disc space-y-1.5 text-[15px] leading-7 text-gray-700 marker:text-gray-400">
      {children}
    </ul>
  );
}

export function LegalContactCard({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl border border-gray-200 bg-white/80 p-6 backdrop-blur shadow-[0_8px_30px_-12px_rgba(15,23,42,0.08)]">
      <div className="space-y-1 text-sm text-gray-700">{children}</div>
    </div>
  );
}

export function LegalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      className="font-medium text-[#ff6313] underline decoration-[#ff6313]/40 underline-offset-4 transition-colors hover:text-[#cc4d0e] hover:decoration-[#cc4d0e]"
    >
      {children}
    </a>
  );
}
