import { NextRequest, NextResponse } from "next/server";
import { getPublishedSiteByPublicId } from "@/lib/db/queries";
import { getPreviewBrowserBundle } from "@/lib/preview/compose-react";

/**
 * Public JavaScript bundle for a published site (same trust as GET /api/published/:siteId).
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ siteId: string }>;
  }
) {
  try {
    const { siteId } = await params;
    const v = request.nextUrl.searchParams.get("v");
    const published = await getPublishedSiteByPublicId(siteId);
    if (!published) {
      return NextResponse.json(
        { error: "Published site not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const bundle = await getPreviewBrowserBundle({
      chatId: published.chatId,
      revisionNumber: published.revisionNumber,
    });

    if (!bundle) {
      return NextResponse.json(
        { error: "Bundle build failed", code: "BUNDLE_ERROR" },
        { status: 500 }
      );
    }

    const revision = published.revisionNumber;
    if (v !== String(revision)) {
      return NextResponse.json(
        {
          error: "Bundle version mismatch; reload the published page",
          code: "STALE_BUNDLE_QUERY",
        },
        { status: 409 }
      );
    }

    return new NextResponse(bundle, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Published bundle API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "PUBLISHED_BUNDLE_ERROR" },
      { status: 500 }
    );
  }
}
