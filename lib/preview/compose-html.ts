import { getLandingSiteFileContentAtOrBeforeRevision } from "@/lib/db/queries";

const INCLUDE_RE = /<!--\s*include:\s*([^\s]+)\s*-->/gi;
const MAX_INCLUDE_DEPTH = 10;
const MAX_INCLUDES_TOTAL = 100;

function normalizeIncludePath(raw: string): string | null {
  if (!raw) return null;
  let p = String(raw).trim();
  if (!p) return null;
  p = p.replace(/\\/g, "/");
  p = p.replace(/^\.\/+/, "");
  p = p.replace(/\/{2,}/g, "/");
  if (p.startsWith("/")) return null;
  if (p.includes("\0")) return null;
  if (p.split("/").some((seg) => seg === ".." || seg === "")) return null;
  if (!p.toLowerCase().endsWith(".html")) return null;
  return p;
}

function missingIncludePlaceholder(path: string): string {
  const safe = path.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div class="mx-auto max-w-6xl px-4 py-8"><div class="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">Missing include: <span class="font-mono">${safe}</span></div></div>`;
}

async function resolveIncludes(params: {
  chatId: string;
  revisionNumber: number;
  content: string;
  depth: number;
  includeCount: { value: number };
  stack: string[];
}): Promise<string> {
  if (params.depth > MAX_INCLUDE_DEPTH) {
    return params.content;
  }

  let out = params.content;
  let match: RegExpExecArray | null;
  INCLUDE_RE.lastIndex = 0;

  while ((match = INCLUDE_RE.exec(out)) !== null) {
    if (params.includeCount.value >= MAX_INCLUDES_TOTAL) {
      break;
    }

    const rawPath = match[1] ?? "";
    const incPath = normalizeIncludePath(rawPath);
    const fullMatch = match[0];
    if (!incPath) {
      out = out.replace(fullMatch, missingIncludePlaceholder(rawPath));
      continue;
    }

    if (params.stack.includes(incPath)) {
      out = out.replace(
        fullMatch,
        `<div class="mx-auto max-w-6xl px-4 py-8"><div class="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Circular include detected: <span class="font-mono">${incPath}</span></div></div>`
      );
      continue;
    }

    params.includeCount.value += 1;
    const included = await getLandingSiteFileContentAtOrBeforeRevision({
      chatId: params.chatId,
      path: incPath,
      revisionNumber: params.revisionNumber,
    });

    if (!included?.content) {
      out = out.replace(fullMatch, missingIncludePlaceholder(incPath));
      continue;
    }

    const resolvedIncluded = await resolveIncludes({
      chatId: params.chatId,
      revisionNumber: params.revisionNumber,
      content: included.content,
      depth: params.depth + 1,
      includeCount: params.includeCount,
      stack: [...params.stack, incPath],
    });

    out = out.replace(fullMatch, resolvedIncluded);
  }

  return out;
}

/**
 * Returns the composed HTML for a landing site at a given revision.
 * Used by preview API and screenshot capture.
 */
export async function getComposedHtml(params: {
  chatId: string;
  revisionNumber: number;
}): Promise<string | null> {
  const entry = await getLandingSiteFileContentAtOrBeforeRevision({
    chatId: params.chatId,
    path: "landing/index.html",
    revisionNumber: params.revisionNumber,
  });

  if (!entry?.content) {
    return null;
  }

  return resolveIncludes({
    chatId: params.chatId,
    revisionNumber: params.revisionNumber,
    content: entry.content,
    depth: 0,
    includeCount: { value: 0 },
    stack: ["landing/index.html"],
  });
}
