import { NextRequest, NextResponse } from "next/server";
import { getPreviewBrowserBundle } from "@/lib/preview/compose-react";
import { verifyRenderSnapshotToken } from "@/lib/render-snapshot-token";
import { buildDeploySecurityHeaders } from "@/lib/preview/deploy-csp";

/**
 * Token-gated JS bundle for the builder preview shell.
 *
 * Loaded same-origin by `/p/<token>` and treated as ephemeral — any new chat
 * revision mints a new token, so this URL is effectively immutable for its
 * lifetime, but we still mark it `no-store` because the bundle content is
 * derived live from DB rows that may be edited.
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

  const bundle = await getPreviewBrowserBundle({
    chatId: verified.chatId,
    revisionNumber: verified.revisionNumber,
  });

  if (!bundle) {
    return NextResponse.json(
      { error: "Bundle build failed", code: "BUNDLE_ERROR" },
      { status: 500 }
    );
  }

  return new NextResponse(bundle, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      ...buildDeploySecurityHeaders(),
    },
  });
}
