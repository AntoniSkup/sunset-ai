import { logger, task } from "@trigger.dev/sdk/v3";
import {
  attachTriggerRunIdToChatTurnRun,
  claimNextPendingChatTurnRun,
  getChatTurnRunById,
  markChatTurnRunFailed,
} from "@/lib/db/queries";
import { diffMs, logChatStreamDiagnostic } from "@/lib/chat/stream-diagnostics";
import { publishStreamEvents } from "@/lib/chat/stream-bus";
import { triggerChatTurnTask } from "@/lib/chat/trigger-chat-turn-task";

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

    const appBaseUrl =
      process.env.APP_BASE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

    if (!appBaseUrl) {
      throw new Error("Missing APP_BASE_URL (or NEXT_PUBLIC_APP_URL/VERCEL_URL)");
    }

    const internalSecret = process.env.INTERNAL_JOB_SECRET;
    if (!internalSecret) {
      throw new Error("Missing INTERNAL_JOB_SECRET");
    }

    const payloadData = claimed.payload as {
      chatId?: string;
      messages?: unknown[];
      userId?: number;
    };
    const chatId = payloadData.chatId;
    const messages = payloadData.messages;

    if (!chatId || !Array.isArray(messages)) {
      throw new Error("Invalid turn-run payload: expected chatId and messages[]");
    }

    try {
      const requestStartedAt = Date.now();
      const response = await fetch(`${appBaseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-job-secret": internalSecret,
        },
        body: JSON.stringify({
          chatId,
          messages,
          userId: claimed.userId,
          turnRunId: claimed.id,
        }),
      });

      logChatStreamDiagnostic("Trigger /api/chat responded", {
        triggerRunId: String(ctx.run.id),
        chatTurnRunId: claimed.id,
        chatId: claimed.chatId,
        status: response.status,
        responseHeadersMs: Date.now() - requestStartedAt,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Internal chat execution failed (${response.status}): ${text.slice(0, 500)}`
        );
      }

      // Ensure the stream fully completes before chaining the next queue item.
      // Drain incrementally to avoid buffering large generations into memory.
      if (response.body) {
        const reader = response.body.getReader();
        let totalBytes = 0;
        let chunkCount = 0;
        let firstChunkLatencyMs: number | null = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunkCount += 1;
          totalBytes += value?.byteLength ?? 0;
          if (firstChunkLatencyMs == null) {
            firstChunkLatencyMs = Date.now() - requestStartedAt;
            logChatStreamDiagnostic("Trigger received first chat chunk", {
              triggerRunId: String(ctx.run.id),
              chatTurnRunId: claimed.id,
              chatId: claimed.chatId,
              firstChunkLatencyMs,
            });
          }
        }
        logChatStreamDiagnostic("Trigger drained chat response stream", {
          triggerRunId: String(ctx.run.id),
          chatTurnRunId: claimed.id,
          chatId: claimed.chatId,
          totalDurationMs: Date.now() - requestStartedAt,
          firstChunkLatencyMs,
          chunkCount,
          totalBytes,
        });
      } else {
        // Some runtimes expose no stream reader; this still waits for completion.
        await response.arrayBuffer();
        logChatStreamDiagnostic("Trigger completed non-streaming chat response", {
          triggerRunId: String(ctx.run.id),
          chatTurnRunId: claimed.id,
          chatId: claimed.chatId,
          totalDurationMs: Date.now() - requestStartedAt,
        });
      }
    } catch (error) {
      const message = normalizeErrorMessage(
        error,
        "Unknown trigger execution error"
      );
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
      await publishStreamEvents({
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
