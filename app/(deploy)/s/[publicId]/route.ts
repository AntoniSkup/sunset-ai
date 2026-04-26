import { NextRequest, NextResponse } from "next/server";
import { getPublishedSiteByPublicId } from "@/lib/db/queries";
import { getPreviewHtml } from "@/lib/preview/compose-react";
import { buildDeploySecurityHeaders } from "@/lib/preview/deploy-csp";

/**
 * Public HTML shell for a published site (e.g. `sunset-deploy.com/s/<publicId>`).
 *
 * No auth — the publicId is the credential. The shell loads its bundle from
 * `/s/<publicId>/bundle?v=<revision>`; the `v` query is a cache-buster /
 * mismatch guard so a refresh after re-publish never serves a stale bundle.
 */
export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ publicId: string }>;
  }
) {
  try {
    const { publicId } = await params;
    const publishedSite = await getPublishedSiteByPublicId(publicId);

    if (!publishedSite) {
      return NextResponse.json(
        { error: "Published site not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const basePath = `/s/${encodeURIComponent(publicId)}`;
    const html = getPreviewHtml({
      chatId: publishedSite.chatId,
      revisionNumber: publishedSite.revisionNumber,
      basePath,
      bundleSuffix: `?v=${publishedSite.revisionNumber}`,
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=0, must-revalidate",
        ...buildDeploySecurityHeaders(),
      },
    });
  } catch (error) {
    console.error("Published site shell error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "PUBLISHED_SITE_ERROR" },
      { status: 500 }
    );
  }
}
