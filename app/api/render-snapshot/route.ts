import { NextRequest, NextResponse } from "next/server";
import { getPreviewHtml } from "@/lib/preview/compose-react";
import { verifyRenderSnapshotToken } from "@/lib/render-snapshot-token";

/**
 * Signed, unauthenticated HTML shell for ScreenshotOne / external renderers.
 * Query: token (JWT from {@link createRenderSnapshotToken}).
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const verified = await verifyRenderSnapshotToken(token);
  if (!verified || !token) {
    return NextResponse.json(
      { error: "Invalid or expired token", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const bundleSuffix = `?token=${encodeURIComponent(token)}`;
  const basePath = "/api/render-snapshot";
  const html = getPreviewHtml({
    chatId: verified.chatId,
    revisionNumber: verified.revisionNumber,
    basePath,
    bundleSuffix,
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
