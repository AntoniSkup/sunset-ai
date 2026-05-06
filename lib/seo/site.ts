import {
  firstHttpOriginFromCandidates,
  isLoopbackHttpOrigin,
} from "@/lib/url/resolve-http-origin";

const PRODUCTION_FALLBACK = "https://www.stronkaai.com";

function readSiteOrigin(): string {
  const origin = firstHttpOriginFromCandidates([
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.BASE_URL,
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ]);

  if (!origin) return PRODUCTION_FALLBACK;

  // For metadata / sitemap / robots we only ever want the public production
  // origin. Loopback values (set in dev `.env`) would poison absolute URLs
  // for crawlers and previews.
  if (isLoopbackHttpOrigin(origin)) return PRODUCTION_FALLBACK;

  return origin;
}

/**
 * Locale-agnostic site constants. Brand name, legal entity, public URL,
 * theme color and the OG image path are identical across every language,
 * so they live here.
 *
 * Localized strings (titles, descriptions, taglines, keywords, the
 * Open Graph `locale` value) are NOT in this file. Pages must read those
 * from `messages/<locale>.json` (via `getTranslations("seo")`) and from
 * `lib/seo/metadata.ts` (for canonical / hreflang / og:locale). This way
 * the same product can target Polish and English search results without
 * the metadata layer leaking one language onto the other.
 */
export const siteConfig = {
  name: "Stronka AI",
  legalName: "Stronka AI",
  url: readSiteOrigin(),
  ogImagePath: "/opengraph-image",
  twitterHandle: undefined as string | undefined,
  themeColor: "#ff6313",
} as const;

export type SiteConfig = typeof siteConfig;

export function absoluteUrl(path = "/"): string {
  if (!path.startsWith("/")) return `${siteConfig.url}/${path}`;
  return `${siteConfig.url}${path}`;
}
