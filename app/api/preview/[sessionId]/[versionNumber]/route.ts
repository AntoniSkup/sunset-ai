import { NextRequest, NextResponse } from "next/server";
import {
  getLatestLandingSiteRevision,
  getLatestVersion,
  getUser,
} from "@/lib/db/queries";
import { getComposedHtml } from "@/lib/preview/compose-html";

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

      const requestedRevision = versionNum > 0 ? versionNum : latestRevision.revisionNumber;
      const composed = await getComposedHtml({
        chatId,
        revisionNumber: requestedRevision,
      });

      if (!composed) {
        return NextResponse.json(
          { error: "Entry file not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }

      return new NextResponse(composed, {
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
