export const IMAGE_SEARCH_ORIENTATIONS = [
  "landscape",
  "portrait",
  "square",
] as const;

export type ImageSearchOrientation = (typeof IMAGE_SEARCH_ORIENTATIONS)[number];

export interface NormalizedImageCandidate {
  provider: string;
  providerAssetId: string;
  pageUrl: string;
  previewUrl: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  photographerName?: string | null;
  photographerUrl?: string | null;
  attributionText?: string | null;
  attributionUrl?: string | null;
  tags?: string[];
}

export interface StockImageSearchParams {
  query: string;
  orientation?: ImageSearchOrientation;
  count?: number;
}
