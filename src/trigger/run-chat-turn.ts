import { logger, task } from "@trigger.dev/sdk/v3";
import type { UIMessage } from "ai";
import { chatTurnEventsStream } from "./chat-turn-stream";

type DbQueriesModule = typeof import("@/lib/db/queries");
type StreamBusModule = typeof import("@/lib/chat/stream-bus");
type LiveStateModule = typeof import("@/lib/chat/live-state");
type ExecuteChatTurnModule = typeof import("@/lib/chat/execute-chat-turn");
type TriggerChatTurnTaskModule = typeof import(
  "@/lib/chat/trigger-chat-turn-task"
);

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
    const turnRunId = payload?.turnRunId;
    if (!turnRunId) {
      throw new Error("turnRunId is required");
    }

    // Fire off all heavy module loads in parallel. These imports carry Drizzle,
    // the Upstash Redis client, the AI SDK + provider bundles, and the Trigger
    // SDK `tasks.trigger` helper. Starting them here means module evaluation
    // overlaps with the claim work below instead of blocking cold start.
    const queriesModulePromise: Promise<DbQueriesModule> = import(
      "@/lib/db/queries"
    );
    const streamBusModulePromise: Promise<StreamBusModule> = import(
      "@/lib/chat/stream-bus"
    );
    const liveStateModulePromise: Promise<LiveStateModule> = import(
      "@/lib/chat/live-state"
    );
    const executeChatTurnModulePromise: Promise<ExecuteChatTurnModule> = import(
      "@/lib/chat/execute-chat-turn"
    );
    const triggerChatTurnTaskModulePromise: Promise<TriggerChatTurnTaskModule> =
      import("@/lib/chat/trigger-chat-turn-task");
    // Silence unhandled rejections; real awaits below surface any errors.
    triggerChatTurnTaskModulePromise.catch(() => {});

    const {
      getChatTurnRunById,
      claimNextPendingChatTurnRun,
      attachTriggerRunIdToChatTurnRun,
      getUserById,
      getChatByPublicId,
      markChatTurnRunFailed,
    } = await queriesModulePromise;

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

    const { publishStreamEvents } = await streamBusModulePromise;

    // Realtime append pipeline.
    // Each chatTurnEventsStream.append() is a separate HTTP call to Trigger's
    // backend. If we await them one-at-a-time inline inside onPublishedTurnEvents
    // the serial HTTP latency (especially EU worker <-> Trigger cloud) blocks
    // publishStreamEvents, which blocks subsequent text_delta flushes, which
    // makes the client see long pauses followed by bursts ("jamming"). Worse:
    // a single failed append would break the for-loop and silently drop every
    // subsequent event in the batch on the realtime channel ("missing chunks"),
    // even though they're safely in Postgres + Redis.
    //
    // Instead, schedule appends on a background promise chain:
    //   - ordered (each append awaits the previous) so logicalEventId arrives
    //     in sequence; the client dedups by logicalEventId and drops anything
    //     <= the last seen id, so out-of-order delivery would *actually* lose
    //     events on the client.
    //   - non-blocking (onPublishedTurnEvents returns immediately); DB and
    //     Redis writes proceed in parallel with realtime fan-out.
    //   - each append has its own .catch so one failure never skips the next.
    //   - drained explicitly before the task exits to guarantee run_completed
    //     and any trailing text_delta reach the client.
    let realtimeAppendChain: Promise<void> = Promise.resolve();
    const scheduleRealtimeAppend = (payload: string) => {
      realtimeAppendChain = realtimeAppendChain.then(async () => {
        try {
          await chatTurnEventsStream.append(payload);
        } catch (error) {
          logger.error("Failed to append to realtime stream", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    };

    try {
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
      for (const event of publishedRunStartedEvents) {
        scheduleRealtimeAppend(serializeRealtimeEvent(event));
      }
      const runStartedLiveStateApply = (async () => {
        const { applyStreamEventsToChatTurnRunLiveState } =
          await liveStateModulePromise;
        await applyStreamEventsToChatTurnRunLiveState({
          runId: claimed.id,
          chatId: claimed.chatId,
          userId: claimed.userId,
          events: publishedRunStartedEvents,
        });
      })();
      const [user, chat, { executeChatTurn }] = await Promise.all([
        getUserById(claimed.userId),
        getChatByPublicId(chatPublicId, claimed.userId),
        executeChatTurnModulePromise,
      ]);
      await runStartedLiveStateApply;

      if (!user) {
        throw new Error(`User not found: ${claimed.userId}`);
      }
      if (!chat) {
        throw new Error(`Chat not found: ${chatPublicId}`);
      }

      await executeChatTurn({
        user,
        chat,
        chatPublicId,
        messages: messages as Array<Omit<UIMessage, "id">>,
        turnRunId: claimed.id,
        persistIncomingUserMessage: false,
        emitRunStarted: false,
        onPublishedTurnEvents: (events) => {
          for (const event of events) {
            scheduleRealtimeAppend(serializeRealtimeEvent(event));
          }
        },
      });

      // Drain pending realtime appends before the task exits so trailing
      // events (especially run_completed, which is the client's signal to
      // finalize and call loadMessages) are guaranteed to reach the client.
      await realtimeAppendChain;
    } catch (error) {
      const message = normalizeErrorMessage(
        error,
        "Unknown trigger execution error"
      );
      const latestRun = await getChatTurnRunById(claimed.id);
      if (latestRun?.status === "failed" || latestRun?.status === "canceled") {
        throw error;
      }
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
        scheduleRealtimeAppend(serializeRealtimeEvent(event));
      }
      const { applyStreamEventsToChatTurnRunLiveState } =
        await liveStateModulePromise;
      await applyStreamEventsToChatTurnRunLiveState({
        runId: claimed.id,
        chatId: claimed.chatId,
        userId: claimed.userId,
        events: publishedEvents,
      });
      // Drain any in-flight realtime appends (including the run_failed we
      // just scheduled) before propagating the error so the client sees the
      // terminal event even when the task is about to throw.
      await realtimeAppendChain.catch(() => {});
      throw error;
    } finally {
      // Safety net: if we got here via an unexpected path that skipped the
      // explicit drains above, still wait for pending appends before the
      // task exits so we don't truncate the realtime stream.
      await realtimeAppendChain.catch(() => {});
      const nextPending = await claimNextPendingChatTurnRun(claimed.chatId);
      if (nextPending) {
        const { triggerChatTurnTask } = await triggerChatTurnTaskModulePromise;
        await triggerChatTurnTask(nextPending.id);
      }
    }

    return { status: "succeeded" as const, runId: claimed.id };
  },
});
