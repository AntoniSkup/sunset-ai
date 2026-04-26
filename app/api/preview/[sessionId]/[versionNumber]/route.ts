import { NextRequest, NextResponse } from "next/server";
import {
  getLatestLandingSiteRevision,
  getLatestRevisionNumberWithFile,
  getLatestVersion,
  getUser,
} from "@/lib/db/queries";
import { getComposedHtml } from "@/lib/preview/compose-html";
import {
  getComposedReactHtml,
  getPreviewHtml,
  getPreviewBrowserBundle,
} from "@/lib/preview/compose-react";

const ENTRY_PATH = "landing/index.tsx";

async function tryComposeAtRevision(params: {
  chatId: string;
  revisionNumber: number;
}): Promise<{ html: string; basePath: string } | null> {
  const { chatId, revisionNumber } = params;
  const basePath = `/api/preview/${chatId}/${revisionNumber}`;

  const bundle = await getPreviewBrowserBundle({ chatId, revisionNumber });
  if (bundle) {
    return {
      html: getPreviewHtml({ chatId, revisionNumber, basePath }),
      basePath,
    };
  }

  const composed =
    (await getComposedReactHtml({ chatId, revisionNumber })) ??
    (await getComposedHtml({ chatId, revisionNumber }));
  if (composed) {
    return { html: composed, basePath };
  }
  return null;
}

export async function GET(
  request: NextRequest,
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

    if (latestRevision) {
      if (latestRevision.userId !== user.id) {
        return NextResponse.json(
          { error: "Unauthorized", code: "UNAUTHORIZED" },
          { status: 403 }
        );
      }

      const requestedRevision =
        versionNum > 0 ? versionNum : latestRevision.revisionNumber;

      // Each tool call produces its own revision containing only the file it
      // wrote, so an early revision can exist before `landing/index.tsx` is
      // created (e.g. a section file was generated first). Try the requested
      // revision first; if it can't compose, fall back to the latest revision
      // that actually contains the entry file so the user sees something
      // renderable instead of a 404.
      let result = await tryComposeAtRevision({
        chatId,
        revisionNumber: requestedRevision,
      });

      if (!result) {
        const fallbackRevision = await getLatestRevisionNumberWithFile({
          chatId,
          path: ENTRY_PATH,
        });
        if (fallbackRevision != null && fallbackRevision !== requestedRevision) {
          console.warn(
            `[preview] Entry missing at chat=${chatId} revision=${requestedRevision}; retrying at latest renderable revision=${fallbackRevision}`
          );
          result = await tryComposeAtRevision({
            chatId,
            revisionNumber: fallbackRevision,
          });
        }
      }

      if (!result) {
        console.warn(
          `[preview] Missing composed revision output for chat=${chatId} revision=${requestedRevision}; falling back to legacy version table if available`
        );
        const legacyVersion = await getLatestVersion(chatId);
        if (legacyVersion && legacyVersion.userId === user.id) {
          return new NextResponse(legacyVersion.codeContent, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          });
        }
        return NextResponse.json(
          {
            error:
              "Preview entry file not found for this revision and no legacy preview is available",
            code: "NOT_FOUND",
          },
          { status: 404 }
        );
      }

      return new NextResponse(result.html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    const version = await getLatestVersion(chatId);

    if (!version) {
      return NextResponse.json(
        { error: "Version not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    if (version.userId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 403 }
      );
    }

    if (version.versionNumber !== versionNum && versionNum > 0) {
      console.warn(
        `Requested version ${versionNum} but returning latest ${version.versionNumber}`
      );
    }

    return new NextResponse(version.codeContent, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Preview API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "PREVIEW_ERROR" },
      { status: 500 }
    );
  }
}
