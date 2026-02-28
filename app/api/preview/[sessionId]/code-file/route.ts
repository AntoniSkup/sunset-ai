import { NextRequest, NextResponse } from "next/server";
import {
  getLatestLandingSiteRevision,
  getLatestVersion,
  getUser,
} from "@/lib/db/queries";
import { getLandingSiteFileContentAtOrBeforeRevision } from "@/lib/db/queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
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
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");
    const revisionParam = searchParams.get("revisionNumber");
    const revisionNumber = revisionParam ? parseInt(revisionParam, 10) : null;

    if (!path || path.trim() === "") {
      return NextResponse.json(
        { error: "Missing path", code: "MISSING_PATH" },
        { status: 400 }
      );
    }

    const latestRevision = await getLatestLandingSiteRevision(chatId);

    if (latestRevision) {
      if (latestRevision.userId !== user.id) {
        return NextResponse.json(
          { error: "Forbidden", code: "FORBIDDEN" },
          { status: 403 }
        );
      }
      const revNum =
        revisionNumber ?? latestRevision.revisionNumber;
      const file = await getLandingSiteFileContentAtOrBeforeRevision({
        chatId,
        path,
        revisionNumber: revNum,
      });
      if (!file) {
        return NextResponse.json(
          { error: "File not found", code: "NOT_FOUND" },
          { status: 404 }
        );
      }
      return new NextResponse(file.content, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }

    const version = await getLatestVersion(chatId);
    if (!version) {
      return NextResponse.json(
        { error: "No version found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    if (version.userId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    if (path !== "index.html" && path !== "index.htm") {
      return NextResponse.json(
        { error: "File not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    return new NextResponse(version.codeContent, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("Code file API error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        code: "CODE_FILE_ERROR",
      },
      { status: 500 }
    );
  }
}
