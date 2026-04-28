"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Inline EN / PL toggle. Cookie-only — switches the active locale by
 * navigating to the localized version of the current pathname. The
 * `NEXT_LOCALE` cookie is set automatically by the i18n middleware on the
 * resulting request, so subsequent page loads stick.
 *
 * Use this in non-authenticated surfaces (footer, marketing pages). For
 * the logged-in settings page use `LanguagePreference` instead, which
 * also writes `users.locale` so server-side work (emails, AI prompts)
 * has a stable preference.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-white/70 p-0.5 text-xs",
        className
      )}
      role="group"
      aria-label="Language"
    >
      {routing.locales.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            disabled={pending || active}
            onClick={() => {
              startTransition(() => {
                // next-intl's router preserves the path; the `locale`
                // option switches the prefix and triggers the middleware
                // to write NEXT_LOCALE.
                router.replace(pathname, { locale: l });
              });
            }}
            className={cn(
              "rounded-full px-2.5 py-1 font-medium uppercase tracking-wide transition",
              active
                ? "bg-gray-900 text-white"
                : "text-gray-500 hover:text-gray-900"
            )}
            aria-pressed={active}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
