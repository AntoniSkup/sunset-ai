import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { db } from "@/lib/db/drizzle";
import { urlImports, type UrlImport } from "@/lib/db/schema";
import { getOrCreateAccountForUser } from "@/lib/billing/accounts";
import { runWithCredits } from "@/lib/credits/run-with-credits";
import { InsufficientCreditsError } from "@/lib/credits/debit";
import { firecrawlScrape } from "./firecrawl-provider";
import {
  shapeContentSummary,
  shapeInspirationSummary,
} from "./shape-summary";
import type {
  UrlImportContentResult,
  UrlImportError,
  UrlImportInspirationResult,
  UrlImportMode,
  UrlImportToolResult,
} from "./types";

/**
 * Top-level orchestrator for the `import_from_url` chat tool.
 *
 *   validate URL → DB cache lookup → call provider → upload screenshot →
 *   shape summary → persist row → return summary to LLM
 *
 * Credits are charged via `runWithCredits` only when we actually call
 * the provider (cache hits are free), matching how the rest of the
 * builder tools bill.
 */

const PROVIDER_NAME = "firecrawl";
const SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB safety cap.

export interface ImportFromUrlParams {
  url: string;
  mode: UrlImportMode;
  chatId: string;
  userId: number;
}

export async function importFromUrl(
  params: ImportFromUrlParams
): Promise<UrlImportToolResult> {
  const { mode, chatId, userId } = params;

  const validated = validateAndNormalizeUrl(params.url);
  if (!validated.ok) {
    return errorResult(validated.error, validated.code);
  }
  const url = validated.url;

  if (!process.env.FIRECRAWL_API_KEY) {
    return errorResult(
      "Web scraping is not configured on this server (missing FIRECRAWL_API_KEY).",
      "PROVIDER_NOT_CONFIGURED"
    );
  }

  const urlHash = hashUrl(url);

  const cached = await findCachedImport({ chatId, urlHash, mode });
  if (cached) {
    return mapPersistedToToolResult(cached, { cached: true });
  }

  const account = await getOrCreateAccountForUser(userId);
  const idempotencyKey = `url-import-${chatId}-${urlHash}-${mode}-${Date.now()}`;

  let toolResult: UrlImportToolResult;
  try {
    toolResult = await runWithCredits(
      {
        accountId: account.id,
        userId,
        actionType: "url_import",
        idempotencyKey,
        provider: PROVIDER_NAME,
        metadata: { mode, urlHash },
      },
      async () => {
        const raw = await firecrawlScrape(url, mode);

        // If we got nothing useful, refuse to persist so the next call
        // can retry without the unique-constraint blocking it.
        if (!raw.markdown.trim() && !raw.title) {
          throw new ProviderEmptyResultError();
        }

        let screenshotBlobUrl: string | null = null;
        if (mode === "inspiration" && raw.screenshotUrl) {
          screenshotBlobUrl = await persistScreenshot({
            ephemeralUrl: raw.screenshotUrl,
            chatId,
            urlHash,
          });
        }

        const summary =
          mode === "content"
            ? shapeContentSummary({ url, raw, cached: false })
            : shapeInspirationSummary({
                url,
                raw,
                screenshotUrl: screenshotBlobUrl,
                cached: false,
              });

        await persistImport({
          chatId,
          userId,
          urlHash,
          url,
          finalUrl: raw.finalUrl,
          mode,
          title: raw.title,
          description: raw.description,
          summary,
          screenshotBlobUrl,
        });

        return summary as UrlImportToolResult;
      }
    );
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return errorResult(
        "Insufficient credits to scrape that URL. Please upgrade your plan or buy more credits.",
        "INSUFFICIENT_CREDITS"
      );
    }
    if (err instanceof ProviderEmptyResultError) {
      return errorResult(
        "The page returned no readable content (it may be blocked, paywalled, or fully script-rendered).",
        "EMPTY_RESULT"
      );
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[url-import] Provider call failed", { url, mode, message });
    return errorResult(
      `Couldn't import that URL right now: ${message}`,
      "PROVIDER_FAILED"
    );
  }

  return toolResult;
}

class ProviderEmptyResultError extends Error {
  constructor() {
    super("Provider returned no usable content");
  }
}

function errorResult(error: string, code?: UrlImportError["code"]): UrlImportError {
  return { success: false, error, code };
}

function hashUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

interface ValidatedUrl {
  ok: true;
  url: string;
}
interface InvalidUrl {
  ok: false;
  error: string;
  code: UrlImportError["code"];
}

function validateAndNormalizeUrl(input: string): ValidatedUrl | InvalidUrl {
  const raw = (input ?? "").trim();
  if (!raw) {
    return { ok: false, error: "URL is required.", code: "INVALID_URL" };
  }

  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { ok: false, error: "URL is not parseable.", code: "INVALID_URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      error: "Only http(s) URLs are supported.",
      code: "INVALID_URL",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      ok: false,
      error: "URLs with embedded credentials are not allowed.",
      code: "INVALID_URL",
    };
  }

  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    return {
      ok: false,
      error: "Private, loopback, and link-local hosts are not allowed.",
      code: "PRIVATE_HOST",
    };
  }

  // Drop hashes — they're never relevant for scraping; keep query string.
  parsed.hash = "";

  return { ok: true, url: parsed.toString() };
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "[::1]") return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;

  // IPv4 private + loopback ranges.
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [, a, b] = ipv4.map((p) => Number(p));
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  // Crude IPv6 private detection (fc00::/7, fe80::/10).
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe8")) {
    if (/^[0-9a-f:]+$/.test(h)) return true;
  }

  return false;
}

async function findCachedImport(params: {
  chatId: string;
  urlHash: string;
  mode: string;
}): Promise<UrlImport | null> {
  const rows = await db
    .select()
    .from(urlImports)
    .where(
      and(
        eq(urlImports.chatId, params.chatId),
        eq(urlImports.urlHash, params.urlHash),
        eq(urlImports.mode, params.mode)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

async function persistImport(params: {
  chatId: string;
  userId: number;
  urlHash: string;
  url: string;
  finalUrl: string;
  mode: UrlImportMode;
  title: string | null;
  description: string | null;
  summary: Record<string, unknown>;
  screenshotBlobUrl: string | null;
}) {
  await db
    .insert(urlImports)
    .values({
      chatId: params.chatId,
      userId: params.userId,
      urlHash: params.urlHash,
      url: params.url,
      finalUrl: params.finalUrl,
      mode: params.mode,
      title: params.title?.slice(0, 512) ?? null,
      description: params.description ?? null,
      summary: params.summary,
      screenshotBlobUrl: params.screenshotBlobUrl,
      provider: PROVIDER_NAME,
    })
    .onConflictDoNothing({
      target: [urlImports.chatId, urlImports.urlHash, urlImports.mode],
    });
}

function mapPersistedToToolResult(
  row: UrlImport,
  opts: { cached: boolean }
): UrlImportToolResult {
  // The persisted summary is already the exact LLM-facing payload; we
  // just refresh `cached` and patch the screenshot URL in case the row
  // was migrated since.
  const summary = row.summary as Record<string, unknown>;
  const base = {
    ...summary,
    success: true,
    cached: opts.cached,
  };

  if (row.mode === "inspiration") {
    return {
      ...(base as unknown as UrlImportInspirationResult),
      screenshotUrl: row.screenshotBlobUrl ?? null,
    };
  }
  return base as unknown as UrlImportContentResult;
}

async function persistScreenshot(params: {
  ephemeralUrl: string;
  chatId: string;
  urlHash: string;
}): Promise<string | null> {
  try {
    const response = await fetch(params.ephemeralUrl, {
      // Firecrawl returns signed URLs (24h TTL). A short timeout
      // protects the chat turn if their CDN is slow.
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      console.warn("[url-import] Screenshot fetch failed", {
        status: response.status,
        url: params.ephemeralUrl,
      });
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) return null;
    if (arrayBuffer.byteLength > SCREENSHOT_MAX_BYTES) {
      console.warn("[url-import] Screenshot too large; skipping persist", {
        bytes: arrayBuffer.byteLength,
      });
      return null;
    }
    const ext = inferImageExt(response.headers.get("content-type"));
    const key = `url-imports/${params.chatId}/${params.urlHash}-${Date.now()}.${ext}`;
    const blob = await put(key, arrayBuffer, {
      access: "public",
      addRandomSuffix: false,
      contentType: response.headers.get("content-type") ?? "image/png",
    });
    return blob.url;
  } catch (err) {
    console.warn("[url-import] Screenshot persist failed", err);
    return null;
  }
}

function inferImageExt(contentType: string | null): string {
  if (!contentType) return "png";
  const lower = contentType.toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("webp")) return "webp";
  return "png";
}
