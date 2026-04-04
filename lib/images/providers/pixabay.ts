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

function mapOrientation(
  orientation?: ImageSearchOrientation
): "horizontal" | "vertical" | undefined {
  if (orientation === "landscape") return "horizontal";
  if (orientation === "portrait") return "vertical";
  return undefined;
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

  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("per_page", String(Math.min(Math.max(params.count ?? 6, 1), 10)));

  const orientation = mapOrientation(params.orientation);
  if (orientation) {
    url.searchParams.set("orientation", orientation);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Pixabay search failed with status ${response.status}`);
  }

  const payload = (await response.json()) as PixabayResponse;
  const hits = Array.isArray(payload.hits) ? payload.hits : [];

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
