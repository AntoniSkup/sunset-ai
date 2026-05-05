import { NextRequest, NextResponse } from "next/server";
import { getLatestLandingSiteRevision, getUser } from "@/lib/db/queries";
import { createRenderSnapshotToken } from "@/lib/render-snapshot-token";
import { buildDeployUrl } from "@/lib/preview/deploy-host";

/**
 * Mints a short-lived JWT for the builder iframe / ScreenshotOne to render
 * the latest revision of `chatId` on the deploy origin.
 *
 * Auth model:
 *   - Caller must be signed in and own the chat (session cookie on main app).
 *   - The minted JWT is bearer-only; it does not carry any session info, just
 *     `(chatId, revisionNumber, exp ~12m)`.
 *   - The deploy host (`stronkaai-deploy.com`) verifies the JWT with the same
 *     `RENDER_SNAPSHOT_SECRET` and never reads cookies.
 */
export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ sessionId: string }>;
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
    const { sessionId: chatId } = await params;

    const latestRevision = await getLatestLandingSiteRevision(chatId);
    if (!latestRevision) {
      return new NextResponse(null, { status: 204 });
    }

    if (latestRevision.userId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const token = await createRenderSnapshotToken({
      chatId,
      revisionNumber: latestRevision.revisionNumber,
    });
    if (!token) {
      return NextResponse.json(
        {
          error:
            "Render token signing key not configured (set RENDER_SNAPSHOT_SECRET or AUTH_SECRET)",
          code: "RENDER_TOKEN_UNAVAILABLE",
        },
        { status: 500 }
      );
    }

    let previewUrl: string;
    try {
      previewUrl = buildDeployUrl(`/p/${encodeURIComponent(token)}`);
    } catch (err) {
      console.error("[preview/token] Deploy origin not configured:", err);
      return NextResponse.json(
        {
          error: "Preview deploy origin not configured",
          code: "DEPLOY_ORIGIN_UNAVAILABLE",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        chatId,
        revisionId: latestRevision.id,
        revisionNumber: latestRevision.revisionNumber,
        token,
        previewUrl,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Preview token API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "TOKEN_ERROR" },
      { status: 500 }
    );
  }
}
