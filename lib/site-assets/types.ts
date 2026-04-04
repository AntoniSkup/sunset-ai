export const SITE_ASSET_INTENTS = [
  "reference",
  "site_asset",
  "both",
] as const;

export type SiteAssetIntent = (typeof SITE_ASSET_INTENTS)[number];

export const SITE_ASSET_SOURCE_TYPES = [
  "upload",
  "stock",
] as const;

export type SiteAssetSourceType = (typeof SITE_ASSET_SOURCE_TYPES)[number];

export const SITE_ASSET_STATUSES = [
  "uploaded",
  "ready",
  "failed",
  "archived",
] as const;

export type SiteAssetStatus = (typeof SITE_ASSET_STATUSES)[number];

export interface SiteAssetFileMetadata {
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  originalFilename?: string | null;
}

export interface SiteAssetRecord {
  id: number;
  chatId: string;
  alias: string;
  blobUrl: string;
  sourceType: SiteAssetSourceType;
  provider?: string | null;
  providerAssetId?: string | null;
  providerPageUrl?: string | null;
  searchQuery?: string | null;
  slotKey?: string | null;
  attributionText?: string | null;
  attributionUrl?: string | null;
  tags?: string[] | null;
  intent: SiteAssetIntent;
  status: SiteAssetStatus;
  altHint?: string | null;
  label?: string | null;
  metadata: SiteAssetFileMetadata;
  createdAt: Date;
  updatedAt: Date;
}

export interface SiteAssetInput {
  alias: string;
  blobUrl: string;
  sourceType?: SiteAssetSourceType;
  provider?: string | null;
  providerAssetId?: string | null;
  providerPageUrl?: string | null;
  searchQuery?: string | null;
  slotKey?: string | null;
  attributionText?: string | null;
  attributionUrl?: string | null;
  tags?: string[] | null;
  intent: SiteAssetIntent;
  altHint?: string | null;
  label?: string | null;
  metadata: SiteAssetFileMetadata;
}

export interface SiteAssetPromptDescriptor {
  alias: string;
  intent: SiteAssetIntent;
  url: string;
  sourceType?: SiteAssetSourceType;
  slotKey?: string | null;
  altHint?: string | null;
  label?: string | null;
}

export interface SiteAssetManifestEntry {
  alias: string;
  url: string;
}
