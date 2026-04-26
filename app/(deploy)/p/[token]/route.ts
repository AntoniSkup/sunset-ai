import { NextRequest, NextResponse } from "next/server";
import { getPreviewHtml } from "@/lib/preview/compose-react";
import { verifyRenderSnapshotToken } from "@/lib/render-snapshot-token";
import { buildDeploySecurityHeaders } from "@/lib/preview/deploy-csp";

/**
 * Token-gated HTML shell served from the deploy origin (e.g. `sunset-deploy.com/p/<jwt>`).
 *
 * Used by:
 *   - The builder iframe (token minted by `/api/preview/<chatId>/token` on main app).
 *   - ScreenshotOne URL captures (same token).
 *
 * The shell loads its bundle from a sibling `/p/<jwt>/bundle` URL on this same
 * origin. Both endpoints verify the same JWT, so revoking the token (by
 * minting a new revision) revokes everything.
 */
export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ token: string }>;
  }
) {
  const { token } = await params;
  const verified = await verifyRenderSnapshotToken(token);
  if (!verified || !token) {
    return NextResponse.json(
      { error: "Invalid or expired token", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const basePath = `/p/${encodeURIComponent(token)}`;
  const html = getPreviewHtml({
    chatId: verified.chatId,
    revisionNumber: verified.revisionNumber,
    basePath,
  });

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...buildDeploySecurityHeaders(),
    },
  });
}
