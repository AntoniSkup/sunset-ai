import { embed } from "@/lib/ai/langsmith-ai";
import { openai } from "@ai-sdk/openai";
import { INSPIRATION_EMBEDDING_DIMENSIONS } from "@/lib/db/schema";

const EMBEDDING_MODEL = "text-embedding-3-small";

export function isInspirationEmbeddingConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? -1 : dot / denom;
}

export function isUsableInspirationEmbedding(
  vector: number[] | null | undefined,
  expectedDim: number = INSPIRATION_EMBEDDING_DIMENSIONS
): boolean {
  if (!vector || vector.length !== expectedDim) return false;
  return vector.some((x) => x !== 0);
}

/**
 * Embeds text using OpenAI (text-embedding-3-small, 1536 dims).
 * Requires OPENAI_API_KEY; chat may use another provider.
 */
export async function embedInspirationText(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed || !isInspirationEmbeddingConfigured()) {
    return null;
  }

  try {
    const { embedding } = await embed({
      model: openai.embedding(EMBEDDING_MODEL),
      value: trimmed.slice(0, 8000),
    });

    if (!embedding?.length) return null;
    if (embedding.length !== INSPIRATION_EMBEDDING_DIMENSIONS) {
      console.warn(
        `[inspiration-embedding] unexpected dimension ${embedding.length}, expected ${INSPIRATION_EMBEDDING_DIMENSIONS}`
      );
      return null;
    }
    return [...embedding];
  } catch (err) {
    console.error("[inspiration-embedding] embed failed", err);
    return null;
  }
}

export function buildInspirationCorpusForStorage(params: {
  description: string;
  tags: string[];
}): string {
  const tagLine = params.tags.length ? params.tags.join(", ") : "";
  return [params.description.trim(), tagLine].filter(Boolean).join("\n\n").trim();
}
