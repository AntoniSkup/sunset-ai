import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import {
  attachTriggerRunIdToChatTurnRun,
  createChatMessage,
  enqueueChatTurnRun,
  getChatByPublicId,
  getChatTurnRunQueueSummary,
  getChatStreamEventsAfter,
  getLatestChatStreamEvent,
  getChatTurnRunByIdempotencyKey,
  getRunningChatTurnRun,
  getUser,
} from "@/lib/db/queries";
import { triggerChatTurnTask } from "@/lib/chat/trigger-chat-turn-task";
import { createTriggerRealtimeSessionForRun } from "@/lib/chat/trigger-realtime-auth";
import {
  extractTextFromMessageParts,
  hasDisplayableMessageParts,
  sanitizePersistedMessageParts,
} from "@/lib/chat/message-parts";
import {
  getOrCreateAccountForUser,
  getSubscriptionByAccountId,
} from "@/lib/billing/accounts";
import { ensureDailyCreditsForAccount } from "@/lib/billing/daily-credits";
import { getCreditsBreakdown } from "@/lib/billing/credits-breakdown";
import { getCreditsCostForAction } from "@/lib/credits/pricing";

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { id: chatPublicId } = await params;
  if (!chatPublicId || typeof chatPublicId !== "string") {
    return NextResponse.json(
      { error: "Invalid chat ID", code: "INVALID_CHAT_ID" },
      { status: 400 },
    );
  }

  const [chat, body, account] = await Promise.all([
    getChatByPublicId(chatPublicId, user.id),
    request.json().catch(() => null),
    getOrCreateAccountForUser(user.id),
  ]);
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found", code: "CHAT_NOT_FOUND" },
      { status: 404 },
    );
  }
  const payload = body?.payload;
  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      { error: "Payload is required", code: "INVALID_PAYLOAD" },
      { status: 400 },
    );
  }

  const idempotencyKey =
    typeof body?.idempotencyKey === "string" && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim().slice(0, 128)
      : `turn-${chat.id}-${nanoid(12)}`;

  const [subscription, existing, _ensureDaily, runningRun] = await Promise.all([
    getSubscriptionByAccountId(account.id),
    getChatTurnRunByIdempotencyKey(idempotencyKey),
    ensureDailyCreditsForAccount(account.id),
    getRunningChatTurnRun(chat.id),
  ]);

  if (existing && existing.chatId === chat.id && existing.userId === user.id) {
    return NextResponse.json({ run: existing, deduped: true });
  }

  const [{ balance }, minCreditsForTurnStart] = await Promise.all([
    getCreditsBreakdown(account.id, subscription),
    getCreditsCostForAction("chat_message", subscription?.planId ?? null),
  ]);
  if (balance < minCreditsForTurnStart) {
    return NextResponse.json(
      {
        error:
          "Insufficient credits. Please upgrade your plan or buy more credits.",
        code: "INSUFFICIENT_CREDITS",
      },
      { status: 402 },
    );
  }

  const hadRunning = Boolean(runningRun);
  const payloadObj = payload as Record<string, unknown>;
  const payloadMessages = Array.isArray(payloadObj.messages)
    ? (payloadObj.messages as Array<{ role?: string; parts?: unknown }>)
    : [];
  const payloadLastMessage = payloadMessages[payloadMessages.length - 1];
  const persistPromise: Promise<void> = (async () => {
    if (
      payloadLastMessage?.role === "user" &&
      Array.isArray(payloadLastMessage.parts)
    ) {
      const persistedParts = sanitizePersistedMessageParts(
        payloadLastMessage.parts,
      );
      const userText = extractTextFromMessageParts(persistedParts);
      if (hasDisplayableMessageParts(persistedParts)) {
        await createChatMessage({
          chatId: chat.id,
          role: "user",
          content: userText.trim(),
          parts: persistedParts,
        });
      }
    }
  })();

  const [, run] = await Promise.all([
    persistPromise,
    enqueueChatTurnRun({
      chatId: chat.id,
      userId: user.id,
      idempotencyKey,
      payload: payloadObj,
    }),
  ]);

  const processingEnabled = process.env.ENABLE_TRIGGER_CHAT_QUEUE === "1";
  let triggerRealtime: { runId: string; accessToken: string } | null = null;
  if (!hadRunning && processingEnabled) {
    const handle = await triggerChatTurnTask(run.id);
    const triggerHandleId = String(handle.id);
    void attachTriggerRunIdToChatTurnRun({
      runId: run.id,
      triggerRunId: triggerHandleId,
    }).catch((error) => {
      console.error(
        "[chat] Failed to attach trigger run id (deferred)",
        error
      );
    });
    triggerRealtime =
      typeof handle.publicAccessToken === "string"
        ? {
            runId: triggerHandleId,
            accessToken: handle.publicAccessToken,
          }
        : await createTriggerRealtimeSessionForRun(triggerHandleId);
  } else if (runningRun?.triggerRunId) {
    triggerRealtime = await createTriggerRealtimeSessionForRun(
      runningRun.triggerRunId,
    );
  }

  return NextResponse.json(
    {
      run,
      queued: hadRunning,
      processingEnabled,
      triggerRealtime,
    },
    { status: 202 },
  );
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { id: chatPublicId } = await params;
  const chat = await getChatByPublicId(chatPublicId, user.id);
  if (!chat) {
    return NextResponse.json(
      { error: "Chat not found", code: "CHAT_NOT_FOUND" },
      { status: 404 },
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
