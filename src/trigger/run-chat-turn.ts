import { logger, task } from "@trigger.dev/sdk/v3";
import type { UIMessage } from "ai";
import {
  attachTriggerRunIdToChatTurnRun,
  claimNextPendingChatTurnRun,
  getChatByPublicId,
  getChatTurnRunById,
  getUserById,
  markChatTurnRunFailed,
} from "@/lib/db/queries";
import { diffMs, logChatStreamDiagnostic } from "@/lib/chat/stream-diagnostics";
import { publishStreamEvents } from "@/lib/chat/stream-bus";
import { applyStreamEventsToChatTurnRunLiveState } from "@/lib/chat/live-state";
import { triggerChatTurnTask } from "@/lib/chat/trigger-chat-turn-task";
import { executeChatTurn } from "@/lib/chat/execute-chat-turn";
import { chatTurnEventsStream } from "./chat-turn-stream";

function serializeRealtimeEvent(event: {
  dbId: number;
  logicalEventId: number;
  chatId: number;
  runId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: Date | string;
}): string {
  return JSON.stringify({
    dbId: event.dbId,
    logicalEventId: event.logicalEventId,
    chatId: event.chatId,
    runId: event.runId,
    eventType: event.eventType,
    payload: event.payload,
    createdAt:
      event.createdAt instanceof Date
        ? event.createdAt.toISOString()
        : String(event.createdAt),
  });
}

function normalizeErrorMessage(
  value: unknown,
  fallback = "Unknown trigger execution error"
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

export const runChatTurnTask = task({
  id: "run-chat-turn",
  maxDuration: 900,
  run: async (payload: { turnRunId: string }, { ctx }) => {
    const taskStartedAt = Date.now();
    const turnRunId = payload?.turnRunId;
    if (!turnRunId) {
      throw new Error("turnRunId is required");
    }

    const existingRun = await getChatTurnRunById(turnRunId);
    if (!existingRun) {
      throw new Error(`Chat turn run not found: ${turnRunId}`);
    }

    const claimed =
      existingRun.status === "running"
        ? existingRun
        : await claimNextPendingChatTurnRun(existingRun.chatId);

    if (!claimed) {
      logger.log("No pending run available to claim", {
        requestedRunId: turnRunId,
        requestedRunStatus: existingRun.status,
        chatId: existingRun.chatId,
      });
      return { status: "skipped" as const };
    }

    if (claimed.id !== turnRunId) {
      logger.log("Processing oldest pending run instead of requested run", {
        requestedRunId: turnRunId,
        claimedRunId: claimed.id,
        chatId: claimed.chatId,
      });
    }

    logChatStreamDiagnostic("Trigger claimed turn run", {
      requestedRunId: turnRunId,
      claimedRunId: claimed.id,
      triggerRunId: String(ctx.run.id),
      chatId: claimed.chatId,
      queueDelayMs: diffMs(claimed.startedAt, claimed.createdAt),
      taskStartupMs: Date.now() - taskStartedAt,
      requestedStatus: existingRun.status,
      claimedSequence: claimed.sequence,
    });

    void attachTriggerRunIdToChatTurnRun({
      runId: claimed.id,
      triggerRunId: String(ctx.run.id),
    }).catch((error) => {
      logger.error("Failed to attach trigger run id (deferred)", {
        runId: claimed.id,
        triggerRunId: String(ctx.run.id),
        error: error instanceof Error ? error.message : String(error),
      });
    });

    const payloadData = claimed.payload as {
      chatId?: string;
      messages?: unknown[];
      userId?: number;
    };
    const chatPublicId = payloadData.chatId;
    const messages = payloadData.messages;

    if (!chatPublicId || !Array.isArray(messages)) {
      throw new Error("Invalid turn-run payload: expected chatId and messages[]");
    }

    try {
      const executionStartedAt = Date.now();
      const executionTimings: Record<string, number> = {};
      const measure = async <T,>(label: string, work: () => Promise<T>): Promise<T> => {
        const startedAt = Date.now();
        try {
          return await work();
        } finally {
          executionTimings[label] = Date.now() - startedAt;
        }
      };
      let firstPublishedEventAtMs: number | null = null;
      let firstTextDeltaAtMs: number | null = null;
      const publishedRunStartedEvents = await publishStreamEvents({
        chatId: claimed.chatId,
        runId: claimed.id,
        events: [
          {
            eventType: "run_started",
            payload: {
              chatId: chatPublicId,
              turnRunId: claimed.id,
            },
          },
        ],
      });
      firstPublishedEventAtMs = Date.now();
      logChatStreamDiagnostic("Trigger published first turn events batch", {
        triggerRunId: String(ctx.run.id),
        chatTurnRunId: claimed.id,
        chatId: claimed.chatId,
        eventTypes: publishedRunStartedEvents.map((event) => event.eventType),
        elapsedMs: firstPublishedEventAtMs - executionStartedAt,
      });
      const runStartedRealtimeAppend = measure(
        "runStartedRealtimeAppendMs",
        async () => {
          for (const event of publishedRunStartedEvents) {
            await chatTurnEventsStream.append(serializeRealtimeEvent(event));
          }
        }
      );
      const runStartedLiveStateApply = measure(
        "runStartedLiveStateApplyMs",
        () =>
          applyStreamEventsToChatTurnRunLiveState({
            runId: claimed.id,
            chatId: claimed.chatId,
            userId: claimed.userId,
            events: publishedRunStartedEvents,
          })
      );
      const [user, chat] = await Promise.all([
        measure("userLookupMs", () => getUserById(claimed.userId)),
        measure("chatLookupMs", () => getChatByPublicId(chatPublicId, claimed.userId)),
      ]);
      await Promise.all([runStartedRealtimeAppend, runStartedLiveStateApply]);

      if (!user) {
        throw new Error(`User not found: ${claimed.userId}`);
      }
      if (!chat) {
        throw new Error(`Chat not found: ${chatPublicId}`);
      }

      logChatStreamDiagnostic("Trigger direct chat execution starting", {
        triggerRunId: String(ctx.run.id),
        chatTurnRunId: claimed.id,
        chatId: claimed.chatId,
        taskDispatchMs: Date.now() - executionStartedAt,
      });

      await measure("executeChatTurnMs", () =>
        executeChatTurn({
          user,
          chat,
          chatPublicId,
          messages: messages as Array<Omit<UIMessage, "id">>,
          turnRunId: claimed.id,
          persistIncomingUserMessage: false,
          emitRunStarted: false,
          onPublishedTurnEvents: async (events) => {
            if (firstTextDeltaAtMs == null) {
              const firstTextDelta = events.find(
                (event) => event.eventType === "text_delta"
              );
              if (firstTextDelta) {
                firstTextDeltaAtMs = Date.now();
                logChatStreamDiagnostic("Trigger published first text delta batch", {
                  triggerRunId: String(ctx.run.id),
                  chatTurnRunId: claimed.id,
                  chatId: claimed.chatId,
                  logicalEventId: firstTextDelta.logicalEventId,
                  elapsedMs: firstTextDeltaAtMs - executionStartedAt,
                });
              }
            }
            for (const event of events) {
              await chatTurnEventsStream.append(serializeRealtimeEvent(event));
            }
          },
        })
      );

      logChatStreamDiagnostic("Trigger direct chat execution completed", {
        triggerRunId: String(ctx.run.id),
        chatTurnRunId: claimed.id,
        chatId: claimed.chatId,
        totalDurationMs: Date.now() - executionStartedAt,
        firstPublishedEventMs:
          firstPublishedEventAtMs == null
            ? null
            : firstPublishedEventAtMs - executionStartedAt,
        firstTextDeltaMs:
          firstTextDeltaAtMs == null ? null : firstTextDeltaAtMs - executionStartedAt,
        executionTimings,
      });
    } catch (error) {
      const message = normalizeErrorMessage(
        error,
        "Unknown trigger execution error"
      );
      const latestRun = await getChatTurnRunById(claimed.id);
      if (latestRun?.status === "failed" || latestRun?.status === "canceled") {
        throw error;
      }
      logChatStreamDiagnostic("Trigger execution failed", {
        triggerRunId: String(ctx.run.id),
        chatTurnRunId: claimed.id,
        chatId: claimed.chatId,
        elapsedMs: Date.now() - taskStartedAt,
        error: message,
      });
      await markChatTurnRunFailed({
        runId: claimed.id,
        errorMessage: message,
      });
      const publishedEvents = await publishStreamEvents({
        chatId: claimed.chatId,
        runId: claimed.id,
        events: [
          {
            eventType: "run_failed",
            payload: {
              runId: claimed.id,
              error: message,
            },
          },
        ],
      });
      for (const event of publishedEvents) {
        await chatTurnEventsStream.append(serializeRealtimeEvent(event));
      }
      await applyStreamEventsToChatTurnRunLiveState({
        runId: claimed.id,
        chatId: claimed.chatId,
        userId: claimed.userId,
        events: publishedEvents,
      });
      throw error;
    } finally {
      const nextPending = await claimNextPendingChatTurnRun(claimed.chatId);
      logChatStreamDiagnostic("Trigger run finished", {
        triggerRunId: String(ctx.run.id),
        chatTurnRunId: claimed.id,
        chatId: claimed.chatId,
        elapsedMs: Date.now() - taskStartedAt,
        nextPendingRunId: nextPending?.id ?? null,
      });
      if (nextPending) {
        await triggerChatTurnTask(nextPending.id);
      }
    }

    return { status: "succeeded" as const, runId: claimed.id };
  },
});
