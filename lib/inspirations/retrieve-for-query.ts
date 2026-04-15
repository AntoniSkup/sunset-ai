import {
  cosineSimilarity,
  embedInspirationText,
  isUsableInspirationEmbedding,
} from "@/lib/ai/embed-inspiration";
import { listInspirations } from "@/lib/db/queries";

export type InspirationRetrievalResult = {
  id: number;
  description: string;
  section: string;
  tags: string[];
  score: number;
};

const MIN_SIMILARITY = 0.25;

/**
 * Returns the closest inspiration row for a natural-language query, or null.
 */
export async function retrieveInspirationForQuery(
  query: string
): Promise<InspirationRetrievalResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const queryEmbedding = await embedInspirationText(trimmed);
  if (!queryEmbedding) return null;

  const rows = await listInspirations(500);
  let best: InspirationRetrievalResult | null = null;

  for (const row of rows) {
    const emb = row.embedding as number[] | undefined;
    if (!isUsableInspirationEmbedding(emb)) continue;
    const vector = emb as number[];

    const score = cosineSimilarity(queryEmbedding, vector);
    if (score < MIN_SIMILARITY) continue;

    if (!best || score > best.score) {
      best = {
        id: row.id,
        description: row.description,
        section: row.section,
        tags: row.tags ?? [],
        score,
      };
    }
  }

  return best;
}
