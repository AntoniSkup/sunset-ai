import Firecrawl, { type Document, type FormatOption } from "@mendable/firecrawl-js";
import type {
  BrandingHints,
  ProviderScrapeResult,
  UrlImportMode,
} from "./types";

/**
 * Firecrawl wrapper used by the `import_from_url` chat tool.
 *
 * Build-time imports are fine: when the chat module loads on a worker,
 * Firecrawl loads with it. The orchestrator gates on
 * `FIRECRAWL_API_KEY` before calling so unconfigured deployments never
 * hit the network.
 */

let cachedClient: Firecrawl | null = null;

function getClient(): Firecrawl {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "FIRECRAWL_API_KEY is not set. Add it to your environment to enable the import_from_url tool."
    );
  }
  cachedClient = new Firecrawl({ apiKey });
  return cachedClient;
}

const SCRAPE_TIMEOUT_MS = 30_000;

export async function firecrawlScrape(
  url: string,
  mode: UrlImportMode
): Promise<ProviderScrapeResult> {
  const client = getClient();

  // mode === "content"     → pull copy/structure for the model to reuse.
  // mode === "inspiration" → pull layout + branding + screenshot for design study.
  // We never request `html` or `rawHtml`: those are token-expensive and
  // we already have markdown for everything we need.
  const formats: FormatOption[] =
    mode === "inspiration"
      ? ["markdown", "branding", { type: "screenshot", fullPage: true }]
      : ["markdown"];

  const raw: Document = await client.scrape(url, {
    formats,
    onlyMainContent: true,
    timeout: SCRAPE_TIMEOUT_MS,
  });

  const metadata = raw.metadata ?? {};
  const finalUrl =
    pickString(metadata.sourceURL) ?? pickString(metadata.url) ?? url;
  const title = pickString(metadata.title) ?? pickString(metadata.ogTitle);
  const description =
    pickString(metadata.description) ?? pickString(metadata.ogDescription);
  const ogImage = pickString(metadata.ogImage);

  return {
    finalUrl,
    title,
    description,
    markdown: typeof raw.markdown === "string" ? raw.markdown : "",
    ogImage,
    branding: parseBranding(raw.branding),
    screenshotUrl: pickString(raw.screenshot),
  };
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseBranding(value: unknown): BrandingHints | null {
  if (!value || typeof value !== "object") return null;
  const b = value as Record<string, unknown>;
  const colorsRaw = (b.colors ?? null) as Record<string, unknown> | null;
  const typographyRaw = (b.typography ?? null) as Record<string, unknown> | null;
  const fontFamiliesRaw = (typographyRaw?.fontFamilies ?? null) as
    | Record<string, unknown>
    | null;
  const imagesRaw = (b.images ?? null) as Record<string, unknown> | null;

  const colors = colorsRaw
    ? {
        primary: pickString(colorsRaw.primary) ?? undefined,
        secondary: pickString(colorsRaw.secondary) ?? undefined,
        accent: pickString(colorsRaw.accent) ?? undefined,
        background: pickString(colorsRaw.background) ?? undefined,
        textPrimary: pickString(colorsRaw.textPrimary) ?? undefined,
        textSecondary: pickString(colorsRaw.textSecondary) ?? undefined,
      }
    : null;

  const fontFamilies = fontFamiliesRaw
    ? {
        primary: pickString(fontFamiliesRaw.primary) ?? undefined,
        heading: pickString(fontFamiliesRaw.heading) ?? undefined,
        code: pickString(fontFamiliesRaw.code) ?? undefined,
      }
    : null;

  const colorsHasAny = colors && Object.values(colors).some(Boolean);
  const fontsHasAny = fontFamilies && Object.values(fontFamilies).some(Boolean);
  const colorScheme = pickString(b.colorScheme);
  const logo = pickString(b.logo) ?? pickString(imagesRaw?.logo);
  const favicon = pickString(imagesRaw?.favicon);

  if (!colorsHasAny && !fontsHasAny && !colorScheme && !logo && !favicon) {
    return null;
  }

  return {
    colorScheme: colorScheme ?? null,
    colors: colorsHasAny ? colors : null,
    fontFamilies: fontsHasAny ? fontFamilies : null,
    logo: logo ?? null,
    favicon: favicon ?? null,
  };
}
