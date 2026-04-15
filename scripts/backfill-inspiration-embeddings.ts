/**
 * One-off: embed all inspirations (or only rows missing usable vectors).
 *
 * Usage:
 *   pnpm db:backfill-inspiration-embeddings
 *   pnpm db:backfill-inspiration-embeddings -- --force   # re-embed every row
 *   pnpm db:backfill-inspiration-embeddings -- --dry-run
 *
 * Requires OPENAI_API_KEY and POSTGRES_URL (see .env).
 */

import { eq } from "drizzle-orm";
import { db, client } from "@/lib/db/drizzle";
import { inspirations } from "@/lib/db/schema";
import {
  buildInspirationCorpusForStorage,
  embedInspirationText,
  isInspirationEmbeddingConfigured,
  isUsableInspirationEmbedding,
} from "@/lib/ai/embed-inspiration";

const force = process.argv.includes("--force");
const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (!isInspirationEmbeddingConfigured()) {
    console.error("OPENAI_API_KEY is not set. Cannot embed.");
    process.exit(1);
  }

  const rows = await db.select().from(inspirations);

  const targets = force
    ? rows
    : rows.filter((r) => !isUsableInspirationEmbedding(r.embedding as number[]));

  console.log(
    `Found ${rows.length} inspiration(s). ${targets.length} to process${force ? " (force: all)" : " (missing/zero embeddings only)"}.`
  );

  if (targets.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  let ok = 0;
  let failed = 0;

  for (const row of targets) {
    const corpus = buildInspirationCorpusForStorage({
      description: row.description,
      tags: row.tags ?? [],
    });

    if (!corpus.trim()) {
      console.warn(`Skip id=${row.id}: empty description and tags`);
      failed++;
      continue;
    }

    if (dryRun) {
      console.log(`[dry-run] would embed id=${row.id} (${corpus.slice(0, 80)}…)`);
      ok++;
      continue;
    }

    const embedding = await embedInspirationText(corpus);
    if (!embedding) {
      console.error(`Failed to embed id=${row.id}`);
      failed++;
      continue;
    }

    await db
      .update(inspirations)
      .set({
        embedding,
        updatedAt: new Date(),
      })
      .where(eq(inspirations.id, row.id));
    console.log(`Updated id=${row.id}`);
    ok++;

    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`Done. ok=${ok} failed=${failed}${dryRun ? " (dry-run)" : ""}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await client.end({ timeout: 5 });
  });
