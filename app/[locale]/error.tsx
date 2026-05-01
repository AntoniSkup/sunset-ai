"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { StatusPageShell } from "@/components/status-page-shell";

/**
 * Error boundary for everything under `app/[locale]`. Wrapped INSIDE
 * `[locale]/layout.tsx`, so `NextIntlClientProvider` is in scope and we
 * can use `useTranslations` here.
 *
 * For errors that escape the root layout itself, see `app/global-error.tsx`.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary");
  const tCommon = useTranslations("common");

  useEffect(() => {
    console.error("[error-boundary] locale", {
      message: error?.message,
      digest: error?.digest,
    });
  }, [error]);

  return (
    <StatusPageShell
      eyebrow="500"
      title={t("title")}
      description={t("description")}
      headerLogo={
        <Link
          href="/"
          className="inline-flex shrink-0 transition-opacity hover:opacity-80"
        >
          <img
            src="/sunset-logo.png"
            alt={tCommon("appName")}
            className="h-8 w-auto object-contain"
          />
        </Link>
      }
      headerAction={
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-full bg-gray-900 px-4 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          {t("backHome")}
        </Link>
      }
      bodyActions={
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-10 items-center rounded-full bg-orange-500 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
        >
          {t("tryAgain")}
        </button>
      }
      footerExtra={<LanguageSwitcher />}
    />
  );
}
