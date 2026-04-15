import { NextResponse } from "next/server";
import {
  buildInspirationCorpusForStorage,
  embedInspirationText,
} from "@/lib/ai/embed-inspiration";
import {
  createInspiration,
  getUser,
  listInspirations,
  updateInspirationEmbedding,
} from "@/lib/db/queries";
import { INSPIRATION_EMBEDDING_DIMENSIONS } from "@/lib/db/schema";

function buildZeroEmbedding() {
  return Array.from({ length: INSPIRATION_EMBEDDING_DIMENSIONS }, () => 0);
}

function normalizeTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) return [];

  const tags = rawTags
    .filter((value): value is string => typeof value === "string")
    .map((value) =>
      value
        .trim()
        .replace(/^['"]+|['"]+$/g, "")
        .toLowerCase()
        .replace(/\s+/g, "-")
    )
    .filter(Boolean);

  return Array.from(new Set(tags));
}

function normalizeSection(raw: unknown): string {
  if (typeof raw !== "string") return "unknown";
  const s = raw
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .slice(0, 64);
  return s || "unknown";
}

async function requireSuperadmin() {
  const user = await getUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (user.role !== "superadmin") {
    return { user: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function GET() {
  const auth = await requireSuperadmin();
  if (auth.response) return auth.response;

  const rows = await listInspirations();

  return NextResponse.json({
    items: rows.map((row) => ({
      id: row.id,
      description: row.description,
      section: row.section,
      tags: row.tags ?? [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      createdByUserId: row.createdByUserId,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireSuperadmin();
  if (auth.response || !auth.user) return auth.response;

  const body = (await request.json()) as {
    description?: unknown;
    section?: unknown;
    tags?: unknown;
  };

  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const section = normalizeSection(body.section);
  const tags = normalizeTags(body.tags);

  if (!description && tags.length === 0) {
    return NextResponse.json(
      { error: "Provide description or tags" },
      { status: 400 }
    );
  }

  const inserted = await createInspiration({
    description: description || "Imported tag-driven inspiration entry.",
    section,
    tags,
    embedding: buildZeroEmbedding(),
    createdByUserId: auth.user.id,
  });

  if (!inserted) {
    return NextResponse.json({ error: "Failed to create inspiration" }, { status: 500 });
  }

  const corpus = buildInspirationCorpusForStorage({
    description: inserted.description,
    tags: inserted.tags ?? [],
  });
  const embedding = await embedInspirationText(corpus);
  if (embedding) {
    await updateInspirationEmbedding(inserted.id, embedding);
  }

  return NextResponse.json({
    item: {
      id: inserted.id,
      description: inserted.description,
      section: inserted.section,
      tags: inserted.tags ?? [],
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
      createdByUserId: inserted.createdByUserId,
    },
  });
}
