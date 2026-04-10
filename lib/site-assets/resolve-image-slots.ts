import {
  createSiteAsset,
  getSiteAssetAliasesByChatId,
  getSiteAssetsByChatId,
} from "@/lib/db/queries";
import { put } from "@vercel/blob";
import { createUniqueSiteAssetAlias } from "@/lib/site-assets/alias";
import { searchStockImages } from "@/lib/images/search-images";
import type { ImageSearchOrientation } from "@/lib/images/providers/types";

const RENDERABLE_INTENTS = new Set(["site_asset", "both"]);
const DEBUG_SITE_IMAGES = process.env.DEBUG_SITE_IMAGES === "1";
const SEARCH_STYLE_HINTS = new Set([
  "warm",
  "moody",
  "editorial",
  "minimal",
  "rustic",
  "luxury",
  "cozy",
  "modern",
  "vintage",
  "dark",
  "bright",
  "cinematic",
]);

export interface ImageSlotRequest {
  slotKey: string;
  purpose: string;
  query: string;
  orientation?: ImageSearchOrientation;
  count?: number;
}

export interface ResolveImageSlotsInput {
  chatId: string;
  userId: number;
  pageGoal: string;
  brandStyle?: string;
  slots: ImageSlotRequest[];
}

export interface ResolvedImageSlot {
  slotKey: string;
  alias: string;
  sourceType: "upload" | "stock";
  provider?: string | null;
  label?: string | null;
  altHint?: string | null;
  reusedExisting: boolean;
}

export interface ResolveImageSlotsResult {
  resolved: ResolvedImageSlot[];
  unresolved: Array<{ slotKey: string; reason: string }>;
}

function debugImageLog(message: string, payload?: Record<string, unknown>) {
  if (!DEBUG_SITE_IMAGES) return;
  if (payload) {
    console.log(`[site-images] ${message}`, payload);
    return;
  }
  console.log(`[site-images] ${message}`);
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function uniqueTokens(...values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.flatMap((value) => tokenize(value ?? ""))));
}

function scoreAssetMatch(
  asset: {
    alias?: string | null;
    label?: string | null;
    altHint?: string | null;
    slotKey?: string | null;
    originalFilename?: string | null;
  },
  slot: ImageSlotRequest
): number {
  const wanted = new Set(
    uniqueTokens(slot.slotKey, slot.purpose, slot.query)
  );
  if (wanted.size === 0) return 0;

  const haystack = uniqueTokens(
    asset.alias,
    asset.label,
    asset.altHint,
    asset.slotKey,
    asset.originalFilename
  );

  let score = 0;
  for (const token of haystack) {
    if (wanted.has(token)) score += 1;
  }

  if (asset.slotKey && asset.slotKey.toLowerCase() === slot.slotKey.toLowerCase()) {
    score += 3;
  }

  return score;
}

function buildLabelFromSlot(slot: ImageSlotRequest, tags?: string[]): string {
  const tagLabel = (tags ?? []).slice(0, 3).join(", ");
  return tagLabel || slot.purpose || slot.slotKey;
}

function buildAltHint(slot: ImageSlotRequest, tags?: string[]): string {
  const tagText = (tags ?? []).slice(0, 5).join(", ");
  if (tagText) {
    return `${slot.purpose}. Visual cues: ${tagText}.`;
  }
  return slot.purpose || slot.query;
}

function inferMimeTypeFromUrl(url: string): string {
  const clean = url.toLowerCase();
  if (clean.includes(".png")) return "image/png";
  if (clean.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

function normalizeStockMimeType(
  contentType: string | null,
  fallbackUrl: string
): string {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (
    normalized === "image/jpeg" ||
    normalized === "image/png" ||
    normalized === "image/webp"
  ) {
    return normalized;
  }

  return inferMimeTypeFromUrl(fallbackUrl);
}

async function mirrorStockImageToBlob(params: {
  chatId: string;
  alias: string;
  imageUrl: string;
}): Promise<{ blobUrl: string; mimeType: string; sizeBytes: number }> {
  const response = await fetch(params.imageUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download stock image: ${response.status} ${response.statusText}`
    );
  }

  const mimeType = normalizeStockMimeType(
    response.headers.get("content-type"),
    params.imageUrl
  );
  const buffer = await response.arrayBuffer();
  const sizeBytes = buffer.byteLength;

  if (sizeBytes <= 0) {
    throw new Error("Downloaded stock image is empty");
  }

  const blob = await put(
    `site-assets/${params.chatId}/stock/${Date.now()}-${params.alias}`,
    buffer,
    {
      access: "public",
      addRandomSuffix: false,
      contentType: mimeType,
    }
  );

  return {
    blobUrl: blob.url,
    mimeType,
    sizeBytes,
  };
}

function aliasBaseFromSlot(slot: ImageSlotRequest): string {
  return `${slot.slotKey}.jpg`;
}

function buildTargetedStockSearchQuery(
  slot: ImageSlotRequest,
  brandStyle?: string
): string {
  const queryTokens = uniqueTokens(slot.query).slice(0, 6);
  const purposeTokens = uniqueTokens(slot.purpose).filter(
    (token) => !queryTokens.includes(token)
  );
  const styleTokens = uniqueTokens(brandStyle).filter(
    (token) => SEARCH_STYLE_HINTS.has(token) && !queryTokens.includes(token)
  );

  const merged = [...queryTokens];

  if (merged.length < 3) {
    merged.push(...purposeTokens.slice(0, 3 - merged.length));
  }

  if (merged.length < 5) {
    merged.push(...styleTokens.slice(0, Math.max(0, 5 - merged.length)));
  }

  return merged.slice(0, 6).join(" ").trim();
}

export async function resolveImageSlots(
  input: ResolveImageSlotsInput
): Promise<ResolveImageSlotsResult> {
  const slots = input.slots
    .map((slot) => ({
      ...slot,
      slotKey: slot.slotKey.trim(),
      purpose: slot.purpose.trim(),
      query: slot.query.trim(),
    }))
    .filter((slot) => slot.slotKey && slot.purpose && slot.query)
    .slice(0, 6);

  if (slots.length === 0) {
    return { resolved: [], unresolved: [] };
  }

  debugImageLog("resolve start", {
    chatId: input.chatId,
    userId: input.userId,
    pageGoal: input.pageGoal,
    brandStyle: input.brandStyle ?? null,
    slots: slots.map((slot) => ({
      slotKey: slot.slotKey,
      purpose: slot.purpose,
      query: slot.query,
      orientation: slot.orientation ?? null,
      count: slot.count ?? 1,
    })),
  });

  const existingAssets = await getSiteAssetsByChatId(input.chatId, input.userId);
  const existingAliases = new Set(
    await getSiteAssetAliasesByChatId(input.chatId, input.userId)
  );
  debugImageLog("existing assets loaded", {
    chatId: input.chatId,
    totalAssets: existingAssets.length,
    assets: existingAssets.map((asset) => ({
      id: asset.id,
      alias: asset.alias,
      sourceType: asset.sourceType ?? "upload",
      intent: asset.intent,
      status: asset.status,
      slotKey: asset.slotKey ?? null,
      label: asset.label ?? null,
    })),
  });
  const usedAssetIds = new Set<number>();
  const resolved: ResolvedImageSlot[] = [];
  const unresolved: Array<{ slotKey: string; reason: string }> = [];
  const pendingStockSlots: ImageSlotRequest[] = [];

  for (const slot of slots) {
    const existingExact = existingAssets.find(
      (asset) =>
        asset.status === "ready" &&
        asset.slotKey &&
        asset.slotKey.toLowerCase() === slot.slotKey.toLowerCase() &&
        RENDERABLE_INTENTS.has(asset.intent) &&
        !usedAssetIds.has(asset.id)
    );

    if (existingExact) {
      usedAssetIds.add(existingExact.id);
      debugImageLog("reused exact existing asset", {
        chatId: input.chatId,
        slotKey: slot.slotKey,
        alias: existingExact.alias,
        sourceType: existingExact.sourceType ?? "upload",
        provider: existingExact.provider ?? null,
      });
      resolved.push({
        slotKey: slot.slotKey,
        alias: existingExact.alias,
        sourceType: (existingExact.sourceType as "upload" | "stock") ?? "upload",
        provider: existingExact.provider ?? null,
        label: existingExact.label ?? null,
        altHint: existingExact.altHint ?? null,
        reusedExisting: true,
      });
      continue;
    }

    const matchingUpload = existingAssets
      .filter(
        (asset) =>
          asset.status === "ready" &&
          (asset.sourceType ?? "upload") === "upload" &&
          RENDERABLE_INTENTS.has(asset.intent) &&
          !usedAssetIds.has(asset.id)
      )
      .map((asset) => ({
        asset,
        score: scoreAssetMatch(asset, slot),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (matchingUpload && matchingUpload.score > 0) {
      usedAssetIds.add(matchingUpload.asset.id);
      debugImageLog("reused uploaded asset", {
        chatId: input.chatId,
        slotKey: slot.slotKey,
        alias: matchingUpload.asset.alias,
        score: matchingUpload.score,
      });
      resolved.push({
        slotKey: slot.slotKey,
        alias: matchingUpload.asset.alias,
        sourceType: "upload",
        provider: null,
        label: matchingUpload.asset.label ?? null,
        altHint: matchingUpload.asset.altHint ?? null,
        reusedExisting: true,
      });
      continue;
    }
    pendingStockSlots.push(slot);
  }

  const stockResults = await Promise.all(
    pendingStockSlots.map(async (slot) => {
      const searchQuery = buildTargetedStockSearchQuery(
        slot,
        input.brandStyle
      );
      try {
        const candidates = await searchStockImages({
          query: searchQuery,
          orientation: slot.orientation,
          count: Math.max(1, slot.count ?? 1),
        });
        debugImageLog("stock search completed", {
          chatId: input.chatId,
          slotKey: slot.slotKey,
          rawQuery: slot.query,
          query: searchQuery,
          candidateCount: candidates.length,
          candidates: candidates.slice(0, 3).map((candidate) => ({
            provider: candidate.provider,
            providerAssetId: candidate.providerAssetId,
            imageUrl: candidate.imageUrl,
            tags: candidate.tags ?? [],
          })),
        });

        return { slot, chosen: candidates[0] ?? null, error: null as string | null };
      } catch (error) {
        debugImageLog("stock search failed", {
          chatId: input.chatId,
          slotKey: slot.slotKey,
          rawQuery: slot.query,
          query: searchQuery,
          error: error instanceof Error ? error.message : "Stock image resolution failed",
        });
        return {
          slot,
          chosen: null,
          error:
            error instanceof Error ? error.message : "Stock image resolution failed",
        };
      }
    })
  );

  for (const result of stockResults) {
    if (result.error) {
      unresolved.push({
        slotKey: result.slot.slotKey,
        reason: result.error,
      });
      continue;
    }

    if (!result.chosen) {
      unresolved.push({
        slotKey: result.slot.slotKey,
        reason: "No stock image candidates found",
      });
      continue;
    }

    const alias = createUniqueSiteAssetAlias(
      aliasBaseFromSlot(result.slot),
      existingAliases,
      "jpg"
    );
    existingAliases.add(alias);
    let mirroredAsset: {
      blobUrl: string;
      mimeType: string;
      sizeBytes: number;
    };

    try {
      mirroredAsset = await mirrorStockImageToBlob({
        chatId: input.chatId,
        alias,
        imageUrl: result.chosen.imageUrl,
      });
    } catch (error) {
      unresolved.push({
        slotKey: result.slot.slotKey,
        reason:
          error instanceof Error
            ? error.message
            : "Failed to mirror stock image to Blob",
      });
      debugImageLog("stock mirror failed", {
        chatId: input.chatId,
        slotKey: result.slot.slotKey,
        alias,
        provider: result.chosen.provider,
        providerAssetId: result.chosen.providerAssetId,
        imageUrl: result.chosen.imageUrl,
        error:
          error instanceof Error
            ? error.message
            : "Failed to mirror stock image to Blob",
      });
      continue;
    }

    const created = await createSiteAsset({
      chatId: input.chatId,
      userId: input.userId,
      alias,
      blobUrl: mirroredAsset.blobUrl,
      sourceType: "stock",
      provider: result.chosen.provider,
      providerAssetId: result.chosen.providerAssetId,
      providerPageUrl: result.chosen.pageUrl,
      searchQuery: result.slot.query,
      slotKey: result.slot.slotKey,
      attributionText: result.chosen.attributionText ?? null,
      attributionUrl: result.chosen.attributionUrl ?? null,
      tags: result.chosen.tags ?? null,
      intent: "site_asset",
      status: "ready",
      mimeType: mirroredAsset.mimeType,
      sizeBytes: mirroredAsset.sizeBytes,
      width: result.chosen.width,
      height: result.chosen.height,
      originalFilename: null,
      altHint: buildAltHint(result.slot, result.chosen.tags),
      label: buildLabelFromSlot(result.slot, result.chosen.tags),
    });

    usedAssetIds.add(created.id);
    debugImageLog("created stock asset", {
      chatId: input.chatId,
      slotKey: result.slot.slotKey,
      alias: created.alias,
      provider: result.chosen.provider,
      providerAssetId: result.chosen.providerAssetId,
      imageUrl: result.chosen.imageUrl,
      blobUrl: created.blobUrl,
    });
    resolved.push({
      slotKey: result.slot.slotKey,
      alias: created.alias,
      sourceType: "stock",
      provider: result.chosen.provider,
      label: created.label ?? null,
      altHint: created.altHint ?? null,
      reusedExisting: false,
    });
  }

  debugImageLog("resolve finished", {
    chatId: input.chatId,
    resolved,
    unresolved,
  });
  return { resolved, unresolved };
}
