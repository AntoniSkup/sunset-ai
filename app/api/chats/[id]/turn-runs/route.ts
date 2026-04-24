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
import { diffMs, logChatStreamDiagnostic } from "@/lib/chat/stream-diagnostics";
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
  const requestStartedAt = Date.now();
  const timings: Record<string, number> = {};
  const measure = async <T,>(label: string, work: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now();
    try {
      return await work();
    } finally {
      timings[label] = Date.now() - startedAt;
    }
  };
  const user = await measure("getUserMs", () => getUser());
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
    measure("chatLookupMs", () => getChatByPublicId(chatPublicId, user.id)),
    measure("payloadParseMs", () => request.json().catch(() => null)),
    measure("accountLookupMs", () => getOrCreateAccountForUser(user.id)),
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
    measure("subscriptionLookupMs", () =>
      getSubscriptionByAccountId(account.id)
    ),
    measure("idempotencyLookupMs", () =>
      getChatTurnRunByIdempotencyKey(idempotencyKey)
    ),
    measure("ensureDailyCreditsMs", () =>
      ensureDailyCreditsForAccount(account.id)
    ),
    measure("runningRunLookupMs", () => getRunningChatTurnRun(chat.id)),
  ]);

  if (existing && existing.chatId === chat.id && existing.userId === user.id) {
    return NextResponse.json({ run: existing, deduped: true });
  }

  const [{ balance }, minCreditsForTurnStart] = await Promise.all([
    measure("creditsBreakdownMs", () =>
      getCreditsBreakdown(account.id, subscription)
    ),
    measure("creditsCostLookupMs", () =>
      getCreditsCostForAction("chat_message", subscription?.planId ?? null)
    ),
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
        await measure("persistUserMessageMs", () =>
          createChatMessage({
            chatId: chat.id,
            role: "user",
            content: userText.trim(),
            parts: persistedParts,
          })
        );
      }
    }
  })();

  const [, run] = await Promise.all([
    persistPromise,
    measure("enqueueRunMs", () =>
      enqueueChatTurnRun({
        chatId: chat.id,
        userId: user.id,
        idempotencyKey,
        payload: payloadObj,
      })
    ),
  ]);

  logChatStreamDiagnostic("Chat turn run enqueued", {
    chatId: chat.id,
    chatPublicId,
    runId: run.id,
    userId: user.id,
    sequence: run.sequence,
    hadRunning,
    enqueueLatencyMs: Date.now() - requestStartedAt,
    createdToNowMs: diffMs(Date.now(), run.createdAt),
  });

  timings.publishEnqueuedMs = 0;

  const processingEnabled = process.env.ENABLE_TRIGGER_CHAT_QUEUE === "1";
  let triggerRealtime: { runId: string; accessToken: string } | null = null;
  if (!hadRunning && processingEnabled) {
    const handle = await measure("triggerTaskMs", () =>
      triggerChatTurnTask(run.id)
    );
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
        : await measure("triggerRealtimeSessionMs", () =>
            createTriggerRealtimeSessionForRun(triggerHandleId)
          );
  } else if (runningRun?.triggerRunId) {
    triggerRealtime = await measure("reuseTriggerRealtimeSessionMs", () =>
      createTriggerRealtimeSessionForRun(runningRun.triggerRunId)
    );
  }

  logChatStreamDiagnostic("Chat turn run request completed", {
    chatId: chat.id,
    chatPublicId,
    runId: run.id,
    queued: hadRunning,
    processingEnabled,
    totalRequestMs: Date.now() - requestStartedAt,
    timings,
  });

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
