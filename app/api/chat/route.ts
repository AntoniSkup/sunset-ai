import { NextRequest, NextResponse } from "next/server";
import { getUser, getUserById, getChatByPublicId } from "@/lib/db/queries";
import { createChatTurnStream } from "@/lib/chat/execute-chat-turn";
import type { UIMessage } from "ai";

function normalizeErrorMessage(
  value: unknown,
  fallback = "Internal server error"
): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[object Object]") return fallback;
    return trimmed;
  }

  if (value instanceof Error) {
    const message = value.message?.trim();
    if (message && message !== "[object Object]") {
      return message;
    }

    const maybeCause = (value as Error & { cause?: unknown }).cause;
    if (maybeCause !== undefined) {
      return normalizeErrorMessage(maybeCause, fallback);
    }

    return fallback;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct =
      (typeof record.message === "string" && record.message.trim()) ||
      (typeof record.error === "string" && record.error.trim()) ||
      (typeof record.summary === "string" && record.summary.trim()) ||
      "";
    if (direct && direct !== "[object Object]") return direct;

    const code =
      typeof record.code === "string" && record.code.trim()
        ? record.code.trim()
        : "";
    if (code) return `${fallback} (${code})`;

    try {
      const serialized = JSON.stringify(record);
      return serialized && serialized !== "{}" ? serialized : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

async function chatHandler(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, chatId, turnRunId } = body as {
      messages?: Array<Omit<UIMessage, "id">>;
      chatId?: string;
      userId?: number;
      turnRunId?: string;
    };
    const internalSecret = request.headers.get("x-internal-job-secret");
    const isInternalJobCall =
      Boolean(process.env.INTERNAL_JOB_SECRET) &&
      internalSecret === process.env.INTERNAL_JOB_SECRET;

    const user = isInternalJobCall
      ? await getUserById(Number((body as any)?.userId))
      : await getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Invalid messages", code: "INVALID_MESSAGE" },
        { status: 400 }
      );
    }

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

    const result = await createChatTurnStream({
      user,
      chat,
      chatPublicId: chatId,
      messages,
      turnRunId,
      persistIncomingUserMessage: !isInternalJobCall,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    const errorMessage = normalizeErrorMessage(error, "Internal server error");
    return NextResponse.json(
      { error: errorMessage, code: "AI_SERVICE_ERROR" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return chatHandler(request);
}