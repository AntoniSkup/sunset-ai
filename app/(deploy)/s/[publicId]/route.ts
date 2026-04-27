import { NextRequest, NextResponse } from "next/server";
import { getPublishedSiteByPublicId } from "@/lib/db/queries";
import { getPreviewHtml } from "@/lib/preview/compose-react";
import { buildDeploySecurityHeaders } from "@/lib/preview/deploy-csp";
import { getPublishedSiteLabelFromHost } from "@/lib/preview/deploy-host";

/**
 * Public HTML shell for a published site. Canonical URL: `<slug>.<deploy host>/`.
 * The `/s/<publicId>` path remains supported on the deploy apex.
 *
 * No auth — the publicId is the credential. The shell loads its bundle from
 * `/bundle` on a subdomain, or `/s/<publicId>/bundle` on the deploy apex, with
 * `?v=<revision>` as cache-buster / mismatch guard.
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
    const publishedSite = await getPublishedSiteByPublicId(publicId);

    if (!publishedSite) {
      return NextResponse.json(
        { error: "Published site not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const headerHost =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const siteLabel = getPublishedSiteLabelFromHost(headerHost);
    const useSubdomainShell =
      Boolean(siteLabel) && siteLabel === publicId;
    const basePath = useSubdomainShell ? "" : `/s/${encodeURIComponent(publicId)}`;
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
