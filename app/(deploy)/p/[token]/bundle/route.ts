import { NextRequest, NextResponse } from "next/server";
import { getPreviewBrowserBundle } from "@/lib/preview/compose-react";
import { verifyRenderSnapshotToken } from "@/lib/render-snapshot-token";
import { buildDeploySecurityHeaders } from "@/lib/preview/deploy-csp";

/**
 * Always-on staged log for the bundle ROUTE (vs. the bundle pipeline). Emits
 * `[landing-bundle:route]` so it's visually separable from the pipeline's
 * `[landing-bundle]` lines. Used to bracket every request with timing and to
 * confirm whether requests are even reaching the route handler when the
 * iframe shows a "non-200 / failed to load script" diagnostic.
 */
function routeLog(stage: string, payload?: Record<string, unknown>): void {
  if (payload === undefined) {
    console.log(`[landing-bundle:route:p] ${stage}`);
  } else {
    console.log(`[landing-bundle:route:p] ${stage}`, payload);
  }
}

/** Inline JS that paints a clear iframe diagnostic if the route handler itself
 * (not just the bundle pipeline) blows up. We still return 200 so the iframe's
 * `<script type="module">` evaluates. */
function routeFailureBundle(message: string): string {
  const literal = JSON.stringify(message);
  return `// Landing preview bundle failed to build. Surface the real reason.
(function(){
  var msg = ${literal};
  try {
    if (typeof window !== "undefined" && typeof window.__landingShowRenderError === "function") {
      window.__landingShowRenderError(msg);
      return;
    }
  } catch (_) {}
})();
`;
}

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
  const startedAt = Date.now();
  routeLog("start");
  try {
    const tParams = Date.now();
    const { token } = await params;
    routeLog("params:ok", {
      ms: Date.now() - tParams,
      tokenPrefix: token ? token.slice(0, 24) + "..." : null,
      tokenLen: token?.length ?? 0,
    });

    const tVerify = Date.now();
    const verified = await verifyRenderSnapshotToken(token);
    routeLog("token-verify:ok", {
      ms: Date.now() - tVerify,
      ok: !!verified,
      chatId: verified?.chatId ?? null,
      revisionNumber: verified?.revisionNumber ?? null,
    });
    if (!verified || !token) {
      routeLog("token-invalid", { totalMs: Date.now() - startedAt });
      return NextResponse.json(
        { error: "Invalid or expired token", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // `getPreviewBrowserBundle` always returns valid JavaScript: either the real
    // bundle, or a small stub that calls `window.__landingShowRenderError` with
    // the actual esbuild error text. We always serve it as 200 so the iframe's
    // <script type="module"> evaluates and paints a useful diagnostic instead of
    // failing silently with a generic "Failed to load script" message.
    const tBundle = Date.now();
    const bundle = await getPreviewBrowserBundle({
      chatId: verified.chatId,
      revisionNumber: verified.revisionNumber,
    });
    routeLog("bundle:ok", {
      ms: Date.now() - tBundle,
      len: bundle.length,
      isErrorStub: bundle.startsWith("// Landing preview bundle failed to build."),
    });

    routeLog("done:200", { totalMs: Date.now() - startedAt, len: bundle.length });
    return new NextResponse(bundle, {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
        ...buildDeploySecurityHeaders(),
      },
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? `Landing bundle route failed: ${err.message}\n${err.stack ?? ""}`
        : `Landing bundle route failed: ${String(err)}`;
    console.error(`[landing-bundle:route:p] unexpected error`, err);
    routeLog("done:route-error-stub", {
      totalMs: Date.now() - startedAt,
      message,
    });
    // Still 200 so the iframe paints the real reason via the early-diagnostic
    // bootstrap. Returning 500 here is what produced the original generic
    // "Failed to load script: …/bundle" message.
    return new NextResponse(routeFailureBundle(message), {
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store",
        ...buildDeploySecurityHeaders(),
      },
    });
  }
}
