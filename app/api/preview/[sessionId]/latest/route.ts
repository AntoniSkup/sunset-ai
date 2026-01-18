import { NextRequest, NextResponse } from "next/server";
import { getLatestVersion, getUser } from "@/lib/db/queries";

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

    const version = await getLatestVersion(chatId);

    if (!version) {
      return new NextResponse(null, { status: 204 });
    }

    if (version.userId !== user.id) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      chatId,
      versionId: version.id,
      versionNumber: version.versionNumber,
      previewUrl: `/api/preview/${chatId}/${version.versionNumber}`,
    });
  } catch (error) {
    console.error("Preview latest API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "PREVIEW_ERROR" },
      { status: 500 }
    );
  }
}


