import { NextRequest, NextResponse } from "next/server";
import {
  getUser,
  getChatByPublicId,
  getLatestLandingSiteRevision,
  createPublishedSite,
  getPublishedSiteByChatId,
  updatePublishedSite,
} from "@/lib/db/queries";

export async function GET(request: NextRequest) {
  const user = await getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get("chatId");

    if (!chatId || typeof chatId !== "string") {
      return NextResponse.json(
        { error: "Chat ID is required", code: "CHAT_ID_REQUIRED" },
        { status: 400 }
      );
    }

    const published = await getPublishedSiteByChatId(chatId, user.id);

    if (!published) {
      return NextResponse.json(
        { published: false },
        { status: 200 }
      );
    }

    return NextResponse.json({
      published: true,
      publicId: published.publicId,
      publishedUrl: `/api/published/${published.publicId}`,
      revisionNumber: published.revisionNumber,
    });
  } catch (error) {
    console.error("Publish GET API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "PUBLISH_ERROR" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { chatId } = body;

    if (!chatId || typeof chatId !== "string") {
      return NextResponse.json(
        { error: "Chat ID is required", code: "CHAT_ID_REQUIRED" },
        { status: 400 }
      );
    }

    const chat = await getChatByPublicId(chatId, user.id);
    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found", code: "CHAT_NOT_FOUND" },
        { status: 404 }
      );
    }

    const latestRevision = await getLatestLandingSiteRevision(chatId);
    if (!latestRevision) {
      return NextResponse.json(
        { error: "No website files found to publish", code: "NO_FILES" },
        { status: 400 }
      );
    }

    const existingPublished = await getPublishedSiteByChatId(chatId, user.id);

    if (existingPublished) {
      const updated = await updatePublishedSite(existingPublished.publicId, user.id, {
        revisionNumber: latestRevision.revisionNumber,
      });

      if (!updated) {
        return NextResponse.json(
          { error: "Failed to update published site", code: "UPDATE_FAILED" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        publicId: updated.publicId,
        publishedUrl: `/api/published/${updated.publicId}`,
        revisionNumber: updated.revisionNumber,
      });
    } else {
      const published = await createPublishedSite({
        chatId,
        userId: user.id,
        revisionNumber: latestRevision.revisionNumber,
      });

      return NextResponse.json({
        success: true,
        publicId: published.publicId,
        publishedUrl: `/api/published/${published.publicId}`,
        revisionNumber: published.revisionNumber,
      });
    }
  } catch (error) {
    console.error("Publish API error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "PUBLISH_ERROR" },
      { status: 500 }
    );
  }
}
