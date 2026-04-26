import { NextRequest, NextResponse } from "next/server";
import {
  getLatestLandingSiteRevision,
  getUser,
} from "@/lib/db/queries";
import { getPreviewBrowserBundle } from "@/lib/preview/compose-react";

export async function GET(
  _request: NextRequest,
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
    if (!latestRevision || latestRevision.userId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 403 }
      );
    }

    const requestedRevision =
      versionNum > 0 ? versionNum : latestRevision.revisionNumber;
    let bundle = await getPreviewBrowserBundle({
      chatId,
      revisionNumber: requestedRevision,
    });

    // Mirror the HTML route's fallback: when the requested revision can't be
    // bundled (entry not yet written, or compile failure), retry at the chat's
    // latest revision so the at-or-before file lookup picks up the entry from
    // whichever revision actually contains it.
    if (!bundle && latestRevision.revisionNumber !== requestedRevision) {
      console.warn(
        `[preview/bundle] Bundle failed at chat=${chatId} revision=${requestedRevision}; retrying at chat's latest revision=${latestRevision.revisionNumber}`
      );
      bundle = await getPreviewBrowserBundle({
        chatId,
        revisionNumber: latestRevision.revisionNumber,
      });
    }

    if (!bundle) {
      return NextResponse.json(
        { error: "Bundle build failed", code: "BUNDLE_ERROR" },
        { status: 500 }
      );
    }

    return new NextResponse(bundle, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Preview bundle API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "PREVIEW_BUNDLE_ERROR" },
      { status: 500 }
    );
  }
}
