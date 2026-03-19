import { NextRequest, NextResponse } from "next/server";
import { getUser, getChatMessagesByPublicId } from "@/lib/db/queries";
import type { UIMessage } from "ai";
import { sanitizePersistedMessageParts } from "@/lib/chat/message-parts";

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

    const merged: Array<{
      id: string;
      role: UIMessage["role"];
      content: string;
      parts: UIMessage["parts"];
    }> = [];


    for (const m of result.messages) {
      const role = m.role as UIMessage["role"];
      const content = m.content ?? "";
      const parts = sanitizePersistedMessageParts(m.parts);

      const last = merged[merged.length - 1];

      if (
        role === "assistant" &&
        last?.role === "assistant" &&
        parts.every((part) => part.type === "text") &&
        last.parts.every((part) => part.type === "text")
      ) {
        last.content = `${last.content}\n\n${content}`.trim();
        last.parts = [
          {
            type: "text",
            text: `${last.content}`.trim(),
          },
        ];
        continue;
      }


      merged.push({
        id: `db-${m.id}`,
        role,
        content,
        parts:
          parts.length > 0 ? parts : [{ type: "text", text: content }],
      });
    }

    const messages: UIMessage[] = merged.map((m) => ({
      id: m.id,
      role: m.role,
      parts: m.parts,
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


