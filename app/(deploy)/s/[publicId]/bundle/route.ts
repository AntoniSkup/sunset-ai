import { NextRequest, NextResponse } from "next/server";
import { getPublishedSiteByPublicId } from "@/lib/db/queries";
import { getPreviewBrowserBundle } from "@/lib/preview/compose-react";
import { buildDeploySecurityHeaders } from "@/lib/preview/deploy-csp";

/** Same convention as `/p/[token]/bundle`: always-on staged log scoped to the
 * published-site route so concurrent traffic between preview and published
 * is visually distinguishable. */
function routeLog(stage: string, payload?: Record<string, unknown>): void {
  if (payload === undefined) {
    console.log(`[landing-bundle:route:s] ${stage}`);
  } else {
    console.log(`[landing-bundle:route:s] ${stage}`, payload);
  }
}

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
  const startedAt = Date.now();
  routeLog("start");
  try {
    const { publicId } = await params;
    const v = request.nextUrl.searchParams.get("v");
    routeLog("params:ok", { publicId, v });

    const tPub = Date.now();
    const published = await getPublishedSiteByPublicId(publicId);
    routeLog("publish-lookup:ok", {
      ms: Date.now() - tPub,
      found: !!published,
      chatId: published?.chatId ?? null,
      revisionNumber: published?.revisionNumber ?? null,
    });
    if (!published) {
      routeLog("not-found", { totalMs: Date.now() - startedAt });
      return NextResponse.json(
        { error: "Published site not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (v !== String(published.revisionNumber)) {
      routeLog("version-mismatch", {
        totalMs: Date.now() - startedAt,
        expected: String(published.revisionNumber),
        got: v,
      });
      return NextResponse.json(
        {
          error: "Bundle version mismatch; reload the published page",
          code: "STALE_BUNDLE_QUERY",
        },
        { status: 409 }
      );
    }

    // `getPreviewBrowserBundle` always returns valid JavaScript: either the
    // real bundle, or a stub that surfaces the esbuild error in the iframe.
    // For published (cached for a year) bundles, we detect the stub path via a
    // marker comment and downgrade Cache-Control to `no-store` so we don't
    // pin a broken site forever in CDNs / browsers if a publish regression
    // ever leaks through.
    const tBundle = Date.now();
    const bundle = await getPreviewBrowserBundle({
      chatId: published.chatId,
      revisionNumber: published.revisionNumber,
    });
    const isErrorStub = bundle.startsWith(
      "// Landing preview bundle failed to build."
    );
    routeLog("bundle:ok", {
      ms: Date.now() - tBundle,
      len: bundle.length,
      isErrorStub,
    });

    routeLog("done:200", { totalMs: Date.now() - startedAt, len: bundle.length });
    return new NextResponse(bundle, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": isErrorStub
          ? "no-store"
          : "public, max-age=31536000, immutable",
        ...buildDeploySecurityHeaders(),
      },
    });
  } catch (error) {
    console.error("[landing-bundle:route:s] unexpected error:", error);
    routeLog("done:500", { totalMs: Date.now() - startedAt });
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "PUBLISHED_BUNDLE_ERROR" },
      { status: 500 }
    );
  }
}
