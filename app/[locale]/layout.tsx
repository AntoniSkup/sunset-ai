import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";

/**
 * Locale-segment layout. Validates the URL locale, registers it for the
 * static-rendering pipeline, and provides the next-intl context to client
 * components below.
 *
 * Global chrome (html/body, fonts, GA, Cookiebot, Toaster, SWR fallbacks)
 * lives in `app/layout.tsx` because non-localized surfaces — currently the
 * deploy-host route handlers under `(deploy)` and the global `not-found` —
 * also rely on it.
 */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return <NextIntlClientProvider>{children}</NextIntlClientProvider>;
}
