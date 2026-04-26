import { NextRequest, NextResponse } from "next/server";
import {
  getLatestLandingSiteRevision,
  getLatestRevisionNumberWithFile,
  getUser,
} from "@/lib/db/queries";
import { getPreviewBrowserBundle } from "@/lib/preview/compose-react";

const ENTRY_PATH = "landing/index.tsx";

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

    // Mirror the HTML route's fallback: if the requested revision predates the
    // entry file, retry at the latest revision that contains it so a direct
    // bundle request still produces something renderable.
    if (!bundle) {
      const fallbackRevision = await getLatestRevisionNumberWithFile({
        chatId,
        path: ENTRY_PATH,
      });
      if (fallbackRevision != null && fallbackRevision !== requestedRevision) {
        console.warn(
          `[preview/bundle] Entry missing at chat=${chatId} revision=${requestedRevision}; retrying at latest renderable revision=${fallbackRevision}`
        );
        bundle = await getPreviewBrowserBundle({
          chatId,
          revisionNumber: fallbackRevision,
        });
      }
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
