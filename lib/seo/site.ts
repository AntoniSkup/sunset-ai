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

export const siteConfig = {
  name: "Stronka AI",
  legalName: "Stronka AI",
  shortDescription: "Kreator stron AI",
  tagline: "Zbuduj stronę rozmawiając",
  description:
    "Stronka AI to kreator stron internetowych i landing page'y oparty na sztucznej inteligencji. Opisz swój biznes po polsku, a Stronka zaprojektuje, zbuduje i opublikuje piękną, konwertującą stronę w kilka sekund — bez szablonów i przeciągania bloków.",
  shortDescriptionSocial:
    "Opisz, czego chcesz. Stronka AI zaprojektuje, zbuduje i opublikuje konwertującą stronę w kilka sekund.",
  url: readSiteOrigin(),
  ogImagePath: "/opengraph-image",
  twitterHandle: undefined as string | undefined,
  locale: "pl_PL",
  themeColor: "#ff6313",
  keywords: [
    "kreator stron AI",
    "kreator stron internetowych",
    "AI kreator stron",
    "generator stron AI",
    "generator landing page",
    "landing page AI",
    "strona internetowa AI",
    "stworzyć stronę AI",
    "stronka AI",
    "kreator landing page",
    "AI landing page builder",
    "AI website builder",
  ],
} as const;

export type SiteConfig = typeof siteConfig;

export function absoluteUrl(path = "/"): string {
  if (!path.startsWith("/")) return `${siteConfig.url}/${path}`;
  return `${siteConfig.url}${path}`;
}
