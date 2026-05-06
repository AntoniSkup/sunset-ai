import type { Metadata } from "next";
import { routing, type AppLocale } from "@/i18n/routing";
import { absoluteUrl, siteConfig } from "@/lib/seo/site";

/**
 * SEO helpers for next-intl + App Router.
 *
 * The goal is to keep all locale-aware URL/metadata math in one place so
 * pages don't reinvent (and accidentally diverge from) hreflang and
 * canonical conventions. Google's i18n guidance:
 *
 *   - Each locale has its own canonical URL.
 *   - Every URL declares ALL of its language alternates via
 *     `<link rel="alternate" hreflang="...">` (in `<head>`), and the set
 *     must be reciprocal across pages.
 *   - One alternate must be `x-default`, pointing at the locale-neutral
 *     entry (we use the default-locale URL for that).
 *   - `og:locale` must match the actual page language; sibling locales go
 *     into `og:locale:alternate`.
 *
 * See: https://developers.google.com/search/docs/specialty/international/localized-versions
 */

const OG_LOCALE_BY_APP_LOCALE: Record<AppLocale, string> = {
  pl: "pl_PL",
  en: "en_US",
};

/**
 * Map an app locale ("pl") to the matching Open Graph locale ("pl_PL").
 * Falls back to the default locale's mapping if an unknown value sneaks in.
 */
export function getOgLocale(locale: string): string {
  if ((locale as AppLocale) in OG_LOCALE_BY_APP_LOCALE) {
    return OG_LOCALE_BY_APP_LOCALE[locale as AppLocale];
  }
  return OG_LOCALE_BY_APP_LOCALE[routing.defaultLocale];
}

/**
 * Sibling Open Graph locales (everything except `currentLocale`).
 * Spread into `openGraph.alternateLocale` so consumers like Facebook
 * know which other languages exist.
 */
export function getOgAlternateLocales(currentLocale: string): string[] {
  return routing.locales
    .filter((l) => l !== currentLocale)
    .map((l) => OG_LOCALE_BY_APP_LOCALE[l]);
}

/**
 * Build a localized pathname using the same prefixing rule as
 * `localePrefix: "as-needed"`: the default locale is served at the bare
 * path, every other locale gets a `/<locale>` prefix.
 *
 * Mirrors `localizedUrl` in `app/sitemap.ts` so canonical URLs in metadata
 * and sitemap entries always agree.
 */
export function localizedPathname(path: string, locale: AppLocale): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (locale === routing.defaultLocale) return normalized;
  if (normalized === "/") return `/${locale}`;
  return `/${locale}${normalized}`;
}

export function localizedUrl(path: string, locale: AppLocale): string {
  return absoluteUrl(localizedPathname(path, locale));
}

/**
 * `alternates` block for `Metadata`:
 *
 *   - `canonical` — the absolute URL of the *current* locale's version of
 *     this path. Pages must NOT use a bare "/" canonical for non-default
 *     locales; doing so tells Google the localized URL is a duplicate of
 *     the default-locale URL and the localized version disappears from
 *     search.
 *   - `languages` — maps every supported locale (plus `x-default`) to its
 *     absolute URL. Next.js renders these as `<link rel="alternate"
 *     hreflang="...">` tags in `<head>`, which is what crawlers actually
 *     read. We always return absolute URLs because relative hreflangs are
 *     undefined per spec.
 *
 * Pass the bare canonical path (e.g. `"/pricing"`, `"/"`) — the helper
 * adds the locale prefix as needed.
 */
export function localizedAlternates(
  path: string,
  locale: AppLocale
): NonNullable<Metadata["alternates"]> {
  const languages: Record<string, string> = {
    "x-default": localizedUrl(path, routing.defaultLocale),
  };
  for (const l of routing.locales) {
    languages[l] = localizedUrl(path, l);
  }
  return {
    canonical: localizedUrl(path, locale),
    languages,
  };
}

/**
 * Resolve the OG image URL for the given locale.
 *
 * Today there's a single `/opengraph-image` route shared across locales
 * (the brand identity is the same in every language). The helper exists
 * so callers don't hardcode the path and so per-locale variants can be
 * added later without touching every page.
 */
export function getOgImageUrl(_locale: AppLocale): string {
  return absoluteUrl(siteConfig.ogImagePath);
}
