import { NextRequest, NextResponse } from "next/server";
import {
  getLandingSiteFileContentAtOrBeforeRevision,
  getLatestLandingSiteRevision,
  getLatestVersion,
  getUser,
} from "@/lib/db/queries";

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

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ sessionId: string; versionNumber: string }>;
  }
) {
  const user = await getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const { sessionId: chatId, versionNumber } = await params;
    const versionNum = parseInt(versionNumber, 10);

    if (isNaN(versionNum)) {
      return NextResponse.json(
        { error: "Invalid version number", code: "INVALID_VERSION" },
        { status: 400 }
      );
    }

    const latestRevision = await getLatestLandingSiteRevision(chatId);

    if (latestRevision) {
      if (latestRevision.userId !== user.id) {
        return NextResponse.json(
          { error: "Unauthorized", code: "UNAUTHORIZED" },
          { status: 403 }
        );
      }

      const requestedRevision = versionNum > 0 ? versionNum : latestRevision.revisionNumber;
      const entry = await getLandingSiteFileContentAtOrBeforeRevision({
        chatId,
        path: "landing/index.html",
        revisionNumber: requestedRevision,
      });

      if (!entry?.content) {
        return NextResponse.json(
          { error: "Entry file not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }

      const composed = await resolveIncludes({
        chatId,
        revisionNumber: requestedRevision,
        content: entry.content,
        depth: 0,
        includeCount: { value: 0 },
        stack: ["landing/index.html"],
      });

      return new NextResponse(composed, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    const version = await getLatestVersion(chatId);

    if (!version) {
      return NextResponse.json(
        { error: "Version not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (version.userId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 403 }
      );
    }

    if (version.versionNumber !== versionNum && versionNum > 0) {
      console.warn(
        `Requested version ${versionNum} but returning latest ${version.versionNumber}`
      );
    }

    return new NextResponse(version.codeContent, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Preview API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "PREVIEW_ERROR" },
      { status: 500 }
    );
  }
}
