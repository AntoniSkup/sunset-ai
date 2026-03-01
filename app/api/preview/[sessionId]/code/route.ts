import { NextRequest, NextResponse } from "next/server";
import {
  getLatestLandingSiteRevision,
  getLatestVersion,
  getUser,
} from "@/lib/db/queries";
import { getAllLandingSiteFilesAtOrBeforeRevision } from "@/lib/db/queries";

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
    const revisionParam = searchParams.get("revisionNumber");
    const revisionNumber = revisionParam ? parseInt(revisionParam, 10) : null;

    const latestRevision = await getLatestLandingSiteRevision(chatId);

    if (latestRevision) {
      if (latestRevision.userId !== user.id) {
        return NextResponse.json(
          { error: "Forbidden", code: "FORBIDDEN" },
          { status: 403 }
        );
      }
      const revNum = revisionNumber ?? latestRevision.revisionNumber;
      const files = await getAllLandingSiteFilesAtOrBeforeRevision({
        chatId,
        revisionNumber: revNum,
      });
      return NextResponse.json({
        files: files.map((f) => ({ path: f.path })),
        revisionNumber: revNum,
        source: "revision" as const,
      });
    }

    const version = await getLatestVersion(chatId);
    if (!version) {
      return NextResponse.json({ files: [], source: "none" as const });
    }
    if (version.userId !== user.id) {
      return NextResponse.json(
        { error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    return NextResponse.json({
      files: [{ path: "index.html" }],
      revisionNumber: version.versionNumber,
      source: "version" as const,
    });
  } catch (error) {
    console.error("Code tree API error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        code: "CODE_TREE_ERROR",
      },
      { status: 500 }
    );
  }
}
