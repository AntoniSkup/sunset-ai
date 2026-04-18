import { NextRequest, NextResponse } from "next/server";
import { getPublishedSiteByPublicId } from "@/lib/db/queries";
import { getComposedHtml } from "@/lib/preview/compose-html";
import {
  getComposedReactHtml,
  getPreviewBrowserBundle,
  getPreviewHtml,
} from "@/lib/preview/compose-react";

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

    const publishedSite = await getPublishedSiteByPublicId(siteId);

    if (!publishedSite) {
      return NextResponse.json(
        { error: "Published site not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const bundle = await getPreviewBrowserBundle({
      chatId: publishedSite.chatId,
      revisionNumber: publishedSite.revisionNumber,
    });

    if (bundle) {
      const basePath = `/api/published/${siteId}`;
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
        },
      });
    }

    const composed =
      (await getComposedReactHtml({
        chatId: publishedSite.chatId,
        revisionNumber: publishedSite.revisionNumber,
      })) ??
      (await getComposedHtml({
        chatId: publishedSite.chatId,
        revisionNumber: publishedSite.revisionNumber,
      }));

    if (!composed) {
      return NextResponse.json(
        { error: "Entry file not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return new NextResponse(composed, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    console.error("Published site API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "PUBLISHED_SITE_ERROR" },
      { status: 500 }
    );
  }
}
