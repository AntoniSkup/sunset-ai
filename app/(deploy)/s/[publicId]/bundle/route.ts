import { NextRequest, NextResponse } from "next/server";
import { getPublishedSiteByPublicId } from "@/lib/db/queries";
import { getPreviewBrowserBundle } from "@/lib/preview/compose-react";
import { buildDeploySecurityHeaders } from "@/lib/preview/deploy-csp";

/**
 * Public JS bundle for a published site. Loaded same-origin by
 * `/s/<publicId>` with `?v=<revision>` to guard against stale caches after
 * re-publish.
 */
export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ publicId: string }>;
  }
) {
  try {
    const { publicId } = await params;
    const v = request.nextUrl.searchParams.get("v");
    const published = await getPublishedSiteByPublicId(publicId);
    if (!published) {
      return NextResponse.json(
        { error: "Published site not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (v !== String(published.revisionNumber)) {
      return NextResponse.json(
        {
          error: "Bundle version mismatch; reload the published page",
          code: "STALE_BUNDLE_QUERY",
        },
        { status: 409 }
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

    return new NextResponse(bundle, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
        ...buildDeploySecurityHeaders(),
      },
    });
  } catch (error) {
    console.error("Published bundle error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "PUBLISHED_BUNDLE_ERROR" },
      { status: 500 }
    );
  }
}
