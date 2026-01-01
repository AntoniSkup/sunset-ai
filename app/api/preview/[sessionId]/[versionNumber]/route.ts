import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/db/queries";
import { getLatestVersion } from "@/lib/db/queries";

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
    const { sessionId, versionNumber } = await params;
    const versionNum = parseInt(versionNumber, 10);

    if (isNaN(versionNum)) {
      return NextResponse.json(
        { error: "Invalid version number", code: "INVALID_VERSION" },
        { status: 400 }
      );
    }

    const version = await getLatestVersion(sessionId);

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
