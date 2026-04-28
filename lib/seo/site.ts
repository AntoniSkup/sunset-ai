import {
  firstHttpOriginFromCandidates,
  isLoopbackHttpOrigin,
} from "@/lib/url/resolve-http-origin";

const PRODUCTION_FALLBACK = "https://www.sunset-builder.com";

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

export const siteConfig = {
  name: "Sunset",
  legalName: "Sunset Builder",
  shortDescription: "AI landing page builder",
  tagline: "Build a landing page by chatting",
  description:
    "Sunset is an AI landing page builder. Describe your business in plain English and ship a beautiful, conversion-focused landing page in seconds — no templates, no drag-and-drop.",
  shortDescriptionSocial:
    "Describe it. Sunset designs, builds, and ships a conversion-focused landing page in seconds.",
  url: readSiteOrigin(),
  ogImagePath: "/opengraph-image",
  twitterHandle: undefined as string | undefined,
  locale: "en_US",
  themeColor: "#ff6313",
  keywords: [
    "AI landing page builder",
    "AI website builder",
    "landing page generator",
    "AI website generator",
    "no-code landing page",
    "build landing page from text",
    "landing page maker",
    "AI web design",
  ],
} as const;

export type SiteConfig = typeof siteConfig;

export function absoluteUrl(path = "/"): string {
  if (!path.startsWith("/")) return `${siteConfig.url}/${path}`;
  return `${siteConfig.url}${path}`;
}
