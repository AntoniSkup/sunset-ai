/**
 * Shared types for the `import_from_url` chat tool stack.
 *
 * The provider layer (Firecrawl today, swappable tomorrow) returns a
 * normalized {@link ProviderScrapeResult}. The orchestrator then trims
 * that into the compact summary the LLM actually sees, persisted to
 * `url_imports` and shaped by mode.
 */

export type UrlImportMode = "content" | "inspiration";

/** Raw, normalized output of the provider call (still server-only). */
export interface ProviderScrapeResult {
  /** Final URL after redirects, falls back to the requested URL. */
  finalUrl: string;
  title: string | null;
  description: string | null;
  /** Cleaned markdown of the main content. May be empty if the page is JS-blank. */
  markdown: string;
  ogImage: string | null;
  /** Optional brand-identity hints from Firecrawl's `branding` format. */
  branding: BrandingHints | null;
  /** Optional ephemeral screenshot URL from the provider (Firecrawl: 24h TTL). */
  screenshotUrl: string | null;
}

export interface BrandingHints {
  colorScheme?: "light" | "dark" | string | null;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    textPrimary?: string;
    textSecondary?: string;
  } | null;
  fontFamilies?: {
    primary?: string;
    heading?: string;
    code?: string;
  } | null;
  logo?: string | null;
  favicon?: string | null;
}

/** What the LLM tool returns to the model. Mode-aware shape. */
export type UrlImportToolResult =
  | UrlImportContentResult
  | UrlImportInspirationResult
  | UrlImportError;

export interface UrlImportBaseSuccess {
  success: true;
  url: string;
  finalUrl: string;
  title: string | null;
  cached: boolean;
}

export interface UrlImportContentResult extends UrlImportBaseSuccess {
  mode: "content";
  description: string | null;
  /** Hard-truncated markdown (≤ MAX_CONTENT_MARKDOWN_CHARS). */
  contentMarkdown: string;
  topImages: Array<{ src: string; alt?: string | null }>;
}

export interface UrlImportInspirationResult extends UrlImportBaseSuccess {
  mode: "inspiration";
  layout: {
    headings: string[];
    sectionCount: number;
    imageCount: number;
    paletteHints: string[];
  };
  branding: BrandingHints | null;
  /** Persisted screenshot URL on Vercel Blob, when capture succeeded. */
  screenshotUrl: string | null;
}

export interface UrlImportError {
  success: false;
  error: string;
  code?:
    | "INVALID_URL"
    | "PRIVATE_HOST"
    | "PROVIDER_FAILED"
    | "PROVIDER_NOT_CONFIGURED"
    | "INSUFFICIENT_CREDITS"
    | "RATE_LIMITED"
    | "EMPTY_RESULT";
}
