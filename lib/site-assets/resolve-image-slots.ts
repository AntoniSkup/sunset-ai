import {
  createSiteAsset,
  getSiteAssetAliasesByChatId,
  getSiteAssetsByChatId,
} from "@/lib/db/queries";
import { createUniqueSiteAssetAlias } from "@/lib/site-assets/alias";
import { searchStockImages } from "@/lib/images/search-images";
import type { ImageSearchOrientation } from "@/lib/images/providers/types";

const RENDERABLE_INTENTS = new Set(["site_asset", "both"]);

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

function aliasBaseFromSlot(slot: ImageSlotRequest, tags?: string[]): string {
  const firstTag = (tags ?? []).find(Boolean);
  return firstTag ? `${slot.slotKey}-${firstTag}.jpg` : `${slot.slotKey}.jpg`;
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

  const existingAssets = await getSiteAssetsByChatId(input.chatId, input.userId);
  const existingAliases = new Set(
    await getSiteAssetAliasesByChatId(input.chatId, input.userId)
  );
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
      try {
        const candidates = await searchStockImages({
          query: [slot.query, input.brandStyle, input.pageGoal]
            .filter(Boolean)
            .join(" "),
          orientation: slot.orientation,
          count: Math.max(1, slot.count ?? 1),
        });

        return { slot, chosen: candidates[0] ?? null, error: null as string | null };
      } catch (error) {
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
      aliasBaseFromSlot(result.slot, result.chosen.tags),
      existingAliases,
      "jpg"
    );
    existingAliases.add(alias);

    const created = await createSiteAsset({
      chatId: input.chatId,
      userId: input.userId,
      alias,
      blobUrl: result.chosen.imageUrl,
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
      mimeType: inferMimeTypeFromUrl(result.chosen.imageUrl),
      sizeBytes: 0,
      width: result.chosen.width,
      height: result.chosen.height,
      originalFilename: null,
      altHint: buildAltHint(result.slot, result.chosen.tags),
      label: buildLabelFromSlot(result.slot, result.chosen.tags),
    });

    usedAssetIds.add(created.id);
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

  return { resolved, unresolved };
}
