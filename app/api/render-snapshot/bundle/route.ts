import { NextRequest, NextResponse } from "next/server";
import { getPreviewBrowserBundle } from "@/lib/preview/compose-react";
import { verifyRenderSnapshotToken } from "@/lib/render-snapshot-token";

/** ESM bundle for `/api/render-snapshot`; requires matching signed token. */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const verified = await verifyRenderSnapshotToken(token);
  if (!verified) {
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
    },
  });
}
