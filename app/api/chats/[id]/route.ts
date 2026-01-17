import { NextRequest, NextResponse } from "next/server";
import { getUser, getChatByPublicId, updateChatByPublicId } from "@/lib/db/queries";

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
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
    const { id } = await params;
    const chatPublicId = id;

    if (!chatPublicId || typeof chatPublicId !== "string") {
      return NextResponse.json(
        { error: "Invalid chat ID", code: "INVALID_CHAT_ID" },
        { status: 400 }
      );
    }

    const chat = await getChatByPublicId(chatPublicId, user.id);

    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found", code: "CHAT_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ chat });
  } catch (error) {
    console.error("Get chat error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "GET_CHAT_ERROR" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
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
    const { id } = await params;
    const chatPublicId = id;

    if (!chatPublicId || typeof chatPublicId !== "string") {
      return NextResponse.json(
        { error: "Invalid chat ID", code: "INVALID_CHAT_ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { title } = body;

    const chat = await updateChatByPublicId(chatPublicId, user.id, {
      title: title || undefined,
    });

    if (!chat) {
      return NextResponse.json(
        { error: "Chat not found", code: "CHAT_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({ chat });
  } catch (error) {
    console.error("Update chat error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "UPDATE_CHAT_ERROR" },
      { status: 500 }
    );
  }
}

