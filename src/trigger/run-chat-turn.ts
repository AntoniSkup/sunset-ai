import { logger, task } from "@trigger.dev/sdk/v3";
import {
  appendChatStreamEvent,
  attachTriggerRunIdToChatTurnRun,
  claimNextPendingChatTurnRun,
  getChatTurnRunById,
  markChatTurnRunFailed,
} from "@/lib/db/queries";
import { triggerChatTurnTask } from "@/lib/chat/trigger-chat-turn-task";

export const runChatTurnTask = task({
  id: "run-chat-turn",
  maxDuration: 900,
  run: async (payload: { turnRunId: string }, { ctx }) => {
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

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Internal chat execution failed (${response.status}): ${text.slice(0, 500)}`
        );
      }

      // Ensure the stream fully completes before chaining the next queue item.
      await response.text();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown trigger execution error";
      await markChatTurnRunFailed({
        runId: claimed.id,
        errorMessage: message,
      });
      await appendChatStreamEvent({
        chatId: claimed.chatId,
        runId: claimed.id,
        eventType: "run_failed",
        payload: {
          runId: claimed.id,
          error: message,
        },
      });
      throw error;
    } finally {
      const nextPending = await claimNextPendingChatTurnRun(claimed.chatId);
      if (nextPending) {
        await triggerChatTurnTask(nextPending.id);
      }
    }

    return { status: "succeeded" as const, runId: claimed.id };
  },
});
