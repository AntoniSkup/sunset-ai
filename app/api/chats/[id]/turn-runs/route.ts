import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import {
  appendChatStreamEvent,
  createChatMessage,
  enqueueChatTurnRun,
  getChatByPublicId,
  getChatTurnRunQueueSummary,
  getChatStreamEventsAfter,
  getLatestChatStreamEvent,
  getChatTurnRunByIdempotencyKey,
  getRunningChatTurnRun,
  generateChatName,
  updateChatByPublicId,
  getUser,
} from "@/lib/db/queries";
import { triggerChatTurnTask } from "@/lib/chat/trigger-chat-turn-task";
import {
  extractTextFromMessageParts,
  hasDisplayableMessageParts,
  sanitizePersistedMessageParts,
} from "@/lib/chat/message-parts";

export async function POST(
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

  const { id: chatPublicId } = await params;
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

  const body = await request.json().catch(() => null);
  const payload = body?.payload;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      { error: "Payload is required", code: "INVALID_PAYLOAD" },
      { status: 400 }
    );
  }

  const idempotencyKey =
    typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim().slice(0, 128)
      : `turn-${chat.id}-${nanoid(12)}`;

  const existing = await getChatTurnRunByIdempotencyKey(idempotencyKey);
  if (existing && existing.chatId === chat.id && existing.userId === user.id) {
    return NextResponse.json({ run: existing, deduped: true });
  }

  const hadRunning = Boolean(await getRunningChatTurnRun(chat.id));
  const payloadObj = payload as Record<string, unknown>;
  const payloadMessages = Array.isArray(payloadObj.messages)
    ? (payloadObj.messages as Array<{ role?: string; parts?: unknown }>)
    : [];
  const payloadLastMessage = payloadMessages[payloadMessages.length - 1];
  if (payloadLastMessage?.role === "user" && Array.isArray(payloadLastMessage.parts)) {
    const persistedParts = sanitizePersistedMessageParts(payloadLastMessage.parts);
    const userText = extractTextFromMessageParts(persistedParts);
    if (hasDisplayableMessageParts(persistedParts)) {
      await createChatMessage({
        chatId: chat.id,
        role: "user",
        content: userText.trim(),
        parts: persistedParts,
      });
      if (!chat.title && userText.trim()) {
        const title = await generateChatName(userText.trim(), {
          userId: user.id,
          chatId: chatPublicId,
        });
        await updateChatByPublicId(chatPublicId, user.id, { title });
      }
    }
  }

  const run = await enqueueChatTurnRun({
    chatId: chat.id,
    userId: user.id,
    idempotencyKey,
    payload: payloadObj,
  });

  await appendChatStreamEvent({
    chatId: chat.id,
    runId: run.id,
    eventType: "run_enqueued",
    payload: {
      runId: run.id,
      sequence: run.sequence,
      status: run.status,
    },
  });

  // Trigger processing if there isn't already an active run for this chat.
  const processingEnabled = process.env.ENABLE_TRIGGER_CHAT_QUEUE === "1";
  if (!hadRunning && processingEnabled) {
    void triggerChatTurnTask(run.id);
  }

  return NextResponse.json(
    {
      run,
      queued: hadRunning,
      processingEnabled,
    },
    { status: 202 }
  );
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

  const { id: chatPublicId } = await params;
  const chat = await getChatByPublicId(chatPublicId, user.id);
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found", code: "CHAT_NOT_FOUND" },
      { status: 404 }
    );
  }

  const url = new URL(request.url);
  const summaryOnly = url.searchParams.get("summary") === "1";
  if (summaryOnly) {
    const summary = await getChatTurnRunQueueSummary(chat.id);
    return NextResponse.json({ summary });
  }

  const latestOnly = url.searchParams.get("latest") === "1";
  if (latestOnly) {
    const latest = await getLatestChatStreamEvent(chat.id);
    return NextResponse.json({ event: latest ?? null });
  }

  const afterEventId = Number(url.searchParams.get("afterEventId") ?? "0");
  const events = await getChatStreamEventsAfter({
    chatId: chat.id,
    afterEventId: Number.isFinite(afterEventId) ? afterEventId : 0,
    limit: 100,
  });

  return NextResponse.json({ events });
}
