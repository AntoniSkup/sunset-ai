import type {
  ProviderScrapeResult,
  UrlImportContentResult,
  UrlImportInspirationResult,
} from "./types";

/**
 * Token-budget belt for the `import_from_url` tool.
 *
 * Firecrawl already returns markdown (~80% smaller than HTML), but we
 * apply a second, mode-aware trim before the result reaches the LLM:
 *
 * - `content` mode keeps body copy but caps the markdown so the model
 *   never receives more than ~6000 chars (~1.5k tokens) per import.
 * - `inspiration` mode discards body copy entirely and returns only
 *   structural signal (headings, counts, palette) plus a screenshot
 *   pointer. Typical payload: a few hundred tokens.
 *
 * Persisted summary in `url_imports.summary` is the same compact object
 * the LLM sees, so opening a chat next week reuses zero credits.
 */

const MAX_CONTENT_MARKDOWN_CHARS = 6_000;
const MAX_HEADINGS = 25;
const MAX_TOP_IMAGES = 8;

const HEADING_LINE_RE = /^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/gm;
const IMAGE_LINE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const SECTION_BREAK_RE = /(?:\n#{1,2}\s|\n---\s*\n|\n\*{3,}\s*\n)/g;

export function shapeContentSummary(params: {
  url: string;
  raw: ProviderScrapeResult;
  cached: boolean;
}): Omit<UrlImportContentResult, "cached"> & { cached: boolean } {
  const { url, raw, cached } = params;
  const markdown = stripMarkdownNoise(raw.markdown);
  const truncated = truncateMarkdown(markdown, MAX_CONTENT_MARKDOWN_CHARS);
  const topImages = extractImages(markdown).slice(0, MAX_TOP_IMAGES);

  return {
    success: true,
    mode: "content",
    url,
    finalUrl: raw.finalUrl,
    title: raw.title,
    description: raw.description,
    contentMarkdown: truncated,
    topImages,
    cached,
  };
}

export function shapeInspirationSummary(params: {
  url: string;
  raw: ProviderScrapeResult;
  screenshotUrl: string | null;
  cached: boolean;
}): Omit<UrlImportInspirationResult, "cached"> & { cached: boolean } {
  const { url, raw, screenshotUrl, cached } = params;
  const markdown = stripMarkdownNoise(raw.markdown);
  const headings = extractHeadings(markdown).slice(0, MAX_HEADINGS);
  const sectionCount = countSections(markdown);
  const imageCount = extractImages(markdown).length;
  const paletteHints = derivePaletteHints(raw);

  return {
    success: true,
    mode: "inspiration",
    url,
    finalUrl: raw.finalUrl,
    title: raw.title,
    layout: {
      headings,
      sectionCount,
      imageCount,
      paletteHints,
    },
    branding: raw.branding,
    screenshotUrl,
    cached,
  };
}

function stripMarkdownNoise(input: string): string {
  if (!input) return "";
  return input
    // collapse 3+ consecutive blank lines to one
    .replace(/\n{3,}/g, "\n\n")
    // drop common nav/footer boilerplate phrases as standalone lines
    .replace(/^\s*(skip to (?:main )?content|cookie (?:policy|preferences))\s*$/gim, "")
    .trim();
}

function truncateMarkdown(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  // Try to cut on a paragraph break for readability.
  const slice = input.slice(0, maxChars);
  const lastBreak = slice.lastIndexOf("\n\n");
  const cutAt = lastBreak > maxChars * 0.6 ? lastBreak : maxChars;
  return `${input.slice(0, cutAt).trimEnd()}\n\n…(truncated)`;
}

function extractHeadings(markdown: string): string[] {
  const out: string[] = [];
  for (const match of markdown.matchAll(HEADING_LINE_RE)) {
    const level = match[1].length;
    const text = match[2].trim();
    if (!text) continue;
    out.push(`${"#".repeat(level)} ${text}`);
    if (out.length >= MAX_HEADINGS) break;
  }
  return out;
}

function extractImages(
  markdown: string
): Array<{ src: string; alt?: string | null }> {
  const seen = new Set<string>();
  const out: Array<{ src: string; alt?: string | null }> = [];
  for (const match of markdown.matchAll(IMAGE_LINE_RE)) {
    const alt = match[1]?.trim() || null;
    const src = match[2]?.trim();
    if (!src || seen.has(src)) continue;
    if (!/^https?:\/\//i.test(src)) continue;
    seen.add(src);
    out.push({ src, alt });
  }
  return out;
}

function countSections(markdown: string): number {
  if (!markdown.trim()) return 0;
  // Heuristic: 1 + number of major separators (h1/h2 or hr).
  return 1 + (markdown.match(SECTION_BREAK_RE)?.length ?? 0);
}

function derivePaletteHints(raw: ProviderScrapeResult): string[] {
  const hints: string[] = [];
  const colors = raw.branding?.colors;
  if (colors) {
    for (const [key, value] of Object.entries(colors)) {
      if (typeof value === "string" && value.trim()) {
        hints.push(`${key}: ${value.trim()}`);
      }
    }
  }
  if (raw.branding?.colorScheme) {
    hints.push(`scheme: ${raw.branding.colorScheme}`);
  }
  return hints.slice(0, 8);
}
