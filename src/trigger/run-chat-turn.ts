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

    await attachTriggerRunIdToChatTurnRun({
      runId: claimed.id,
      triggerRunId: String(ctx.run.id),
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
      const [user, chat] = await Promise.all([
        getUserById(claimed.userId),
        getChatByPublicId(chatPublicId, claimed.userId),
      ]);

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

      await executeChatTurn({
        user,
        chat,
        chatPublicId,
        messages: messages as Array<Omit<UIMessage, "id">>,
        turnRunId: claimed.id,
        persistIncomingUserMessage: false,
      });

      logChatStreamDiagnostic("Trigger direct chat execution completed", {
        triggerRunId: String(ctx.run.id),
        chatTurnRunId: claimed.id,
        chatId: claimed.chatId,
        totalDurationMs: Date.now() - executionStartedAt,
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
