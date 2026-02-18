import { NextRequest, NextResponse } from "next/server";
import {
  getUser,
  getChatMessagesByPublicId,
  getChatToolCallsByChatId,
} from "@/lib/db/queries";
import type { UIMessage } from "ai";
import type { ChatToolCall } from "@/lib/db/schema";

function toMs(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }
  const ms = new Date(value as any).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function buildUIMessageParts(
  content: string,
  toolCalls: ChatToolCall[]
): UIMessage["parts"] {
  const parts: UIMessage["parts"] = [];

  if (content?.trim()) {
    parts.push({ type: "text", text: content });
  }

  for (const tc of toolCalls) {
    if (tc.state === "call") {
      const raw = tc.input as any;
      const args =
        raw?.args ?? raw?.input ?? raw?.arguments ?? raw?.parameters ?? raw ?? {};
      (parts as Array<Record<string, unknown>>).push({
        type: "tool-call",
        toolCallId: tc.toolCallId ?? `tool-${tc.id}`,
        toolName: tc.toolName,
        args,
      });
    } else if (tc.state === "result") {
      const raw = tc.output as any;
      const result = raw?.output ?? raw?.result ?? raw ?? {};
      (parts as Array<Record<string, unknown>>).push({
        type: "tool-result",
        toolCallId: tc.toolCallId ?? `tool-${tc.id}`,
        toolName: tc.toolName,
        result,
      });
    }
  }

  return parts.length > 0 ? parts : ([{ type: "text", text: content || "" }] as UIMessage["parts"]);
}

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

    const toolCalls = await getChatToolCallsByChatId(result.chat.id);

    // Merge consecutive assistant messages (preserve original behavior)
    const merged: Array<{
      id: string;
      role: UIMessage["role"];
      content: string;
      createdAtMs: number;
    }> = [];

    for (const m of result.messages) {
      const role = m.role as UIMessage["role"];
      const content = m.content ?? "";
      const createdAtMs = toMs((m as any).createdAt ?? Date.now());

      const last = merged[merged.length - 1];

      if (role === "assistant" && last?.role === "assistant") {
        last.content = `${last.content}\n\n${content}`.trim();
        continue;
      }

      merged.push({
        id: `db-${m.id}`,
        role,
        content,
        createdAtMs,
      });
    }

    // Build UIMessages with tool calls for each assistant message
    const messages: UIMessage[] = [];
    let lastUserCreatedAtMs: number | null = null;

    for (let i = 0; i < merged.length; i++) {
      const m = merged[i];

      if (m.role === "user") {
        lastUserCreatedAtMs = m.createdAtMs;
        messages.push({
          id: m.id,
          role: m.role,
          parts: [{ type: "text", text: m.content }],
        });
        continue;
      }

      if (m.role === "assistant") {
        // Tool calls for this turn: created after previous user message, before next user message
        const nextUser = merged
          .slice(i + 1)
          .find((x) => x.role === "user");
        const nextUserCreatedAtMs = nextUser?.createdAtMs ?? null;

        const turnToolCalls = toolCalls.filter((tc) => {
          const tcMs = toMs((tc as any).createdAt ?? 0);
          const afterPrevUser =
            lastUserCreatedAtMs == null || tcMs > lastUserCreatedAtMs;
          const beforeNextUser =
            nextUserCreatedAtMs == null || tcMs < nextUserCreatedAtMs;
          return afterPrevUser && beforeNextUser;
        });

        const parts = buildUIMessageParts(m.content, turnToolCalls);

        messages.push({
          id: m.id,
          role: m.role,
          parts,
        });
      }
    }

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
