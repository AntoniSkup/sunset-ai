import { NextRequest, NextResponse } from "next/server";
import { getUser, getChatMessagesByPublicId } from "@/lib/db/queries";
import type { UIMessage } from "ai";

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

    const result = await getChatMessagesByPublicId(chatPublicId, user.id);
    if (!result) {
      return NextResponse.json(
        { error: "Chat not found", code: "CHAT_NOT_FOUND" },
        { status: 404 }
      );
    }

    const messages: UIMessage[] = result.messages.map((m) => ({
      id: `db-${m.id}`,
      role: m.role as UIMessage["role"],
      parts: [{ type: "text", text: m.content }],
    }));

    return NextResponse.json({ chat: result.chat, messages });
  } catch (error) {
    console.error("Get chat messages error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: errorMessage, code: "GET_CHAT_MESSAGES_ERROR" },
      { status: 500 }
    );
  }
}


