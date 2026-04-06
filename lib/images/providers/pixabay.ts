import type {
  ImageSearchOrientation,
  NormalizedImageCandidate,
  StockImageSearchParams,
} from "./types";

interface PixabayHit {
  id: number;
  pageURL: string;
  tags?: string;
  previewURL?: string;
  webformatURL?: string;
  largeImageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  user?: string;
}

interface PixabayResponse {
  hits?: PixabayHit[];
}

const DEBUG_SITE_IMAGES = process.env.DEBUG_SITE_IMAGES === "1";
const PIXABAY_MIN_PER_PAGE = 3;
const PIXABAY_MAX_PER_PAGE = 200;

function mapOrientation(
  orientation?: ImageSearchOrientation
): "horizontal" | "vertical" | undefined {
  if (orientation === "landscape") return "horizontal";
  if (orientation === "portrait") return "vertical";
  return undefined;
}

function debugPixabayLog(message: string, payload?: Record<string, unknown>) {
  if (!DEBUG_SITE_IMAGES) return;
  if (payload) {
    console.log(`[pixabay] ${message}`, payload);
    return;
  }
  console.log(`[pixabay] ${message}`);
}

function toTagList(tags?: string): string[] {
  return String(tags ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export async function searchPixabayImages(
  params: StockImageSearchParams
): Promise<NormalizedImageCandidate[]> {
  const apiKey = process.env.PIXABAY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("PIXABAY_API_KEY is not configured");
  }

  const query = params.query.trim();
  if (!query) {
    return [];
  }
  const perPage = Math.min(
    Math.max(params.count ?? 6, PIXABAY_MIN_PER_PAGE),
    PIXABAY_MAX_PER_PAGE
  );

  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("per_page", String(perPage));

  const orientation = mapOrientation(params.orientation);
  if (orientation) {
    url.searchParams.set("orientation", orientation);
  }

  debugPixabayLog("request", {
    query,
    orientation: orientation ?? null,
    perPage,
    url: url.toString().replace(apiKey, "***"),
  });

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    debugPixabayLog("response error", {
      status: response.status,
      statusText: response.statusText,
      body: responseText || null,
    });
    throw new Error(
      `Pixabay search failed with status ${response.status}${responseText ? `: ${responseText}` : ""}`
    );
  }

  const payload = (await response.json()) as PixabayResponse;
  const hits = Array.isArray(payload.hits) ? payload.hits : [];
  debugPixabayLog("response success", {
    totalHits: hits.length,
    sample: hits.slice(0, 3).map((hit) => ({
      id: hit.id,
      pageURL: hit.pageURL,
      tags: hit.tags ?? "",
    })),
  });

  return hits
    .map((hit): NormalizedImageCandidate | null => {
      const imageUrl = hit.largeImageURL || hit.webformatURL || hit.previewURL || "";
      if (!imageUrl || !hit.pageURL || !hit.id) {
        return null;
      }

      const photographerName = hit.user?.trim() || null;
      const tags = toTagList(hit.tags);

      return {
        provider: "pixabay",
        providerAssetId: String(hit.id),
        pageUrl: hit.pageURL,
        previewUrl: hit.previewURL || hit.webformatURL || imageUrl,
        imageUrl,
        width: typeof hit.imageWidth === "number" ? hit.imageWidth : null,
        height: typeof hit.imageHeight === "number" ? hit.imageHeight : null,
        photographerName,
        photographerUrl: null,
        attributionText: photographerName
          ? `Photo by ${photographerName} on Pixabay`
          : "Photo from Pixabay",
        attributionUrl: hit.pageURL,
        tags,
      };
    })
    .filter((candidate): candidate is NormalizedImageCandidate => Boolean(candidate));
}
