import { searchPixabayImages } from "./providers/pixabay";
import type { NormalizedImageCandidate, StockImageSearchParams } from "./providers/types";

export async function searchStockImages(
  params: StockImageSearchParams
): Promise<NormalizedImageCandidate[]> {
  return searchPixabayImages(params);
}
