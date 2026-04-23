import type { UIMessage } from "ai";
import type { StreamEventEnvelope } from "./stream-bus/types";
import {
  getChatTurnRunLiveStateByRunId,
  upsertChatTurnRunLiveState,
} from "@/lib/db/queries";
import type { ChatTurnRunLivePreviewState } from "@/lib/db/schema";

type LiveAssistantParts = UIMessage["parts"];

function normalizeAssistantParts(value: unknown): LiveAssistantParts {
  return Array.isArray(value) ? (value as LiveAssistantParts) : [];
}

function upsertToolCallPart(
  parts: LiveAssistantParts,
  payload: Record<string, unknown>
): LiveAssistantParts {
  const toolCallId = String(payload.toolCallId ?? "");
  const toolName = String(payload.toolName ?? "unknown");
  const destination =
    typeof payload.destination === "string" ? payload.destination : undefined;

  if (!toolCallId) return parts;

  const nextParts = [...parts];
  const existingIndex = nextParts.findIndex(
    (part: any) => part?.type === "tool-call" && part?.toolCallId === toolCallId
  );
  const nextPart = {
    type: "tool-call",
    toolCallId,
    toolName,
    args: destination ? { destination } : undefined,
  } as LiveAssistantParts[number];

  if (existingIndex === -1) {
    nextParts.push(nextPart);
  } else {
    const existing = nextParts[existingIndex] as any;
    nextParts[existingIndex] = {
      ...existing,
      ...nextPart,
      args:
        destination && (!existing?.args || !existing.args.destination)
          ? { ...(existing?.args ?? {}), destination }
          : existing?.args,
    } as LiveAssistantParts[number];
  }

  return nextParts;
}

function upsertToolResultPart(
  parts: LiveAssistantParts,
  payload: Record<string, unknown>
): LiveAssistantParts {
  const toolCallId = String(payload.toolCallId ?? "");
  const toolName = String(payload.toolName ?? "unknown");
  const result = payload.result ?? null;
  if (!toolCallId) return parts;

  const nextParts = [...parts];
  const existingIndex = nextParts.findIndex(
    (part: any) =>
      part?.type === "tool-result" && part?.toolCallId === toolCallId
  );
  const nextPart = {
    type: "tool-result",
    toolCallId,
    toolName,
    result,
  } as LiveAssistantParts[number];

  if (existingIndex === -1) {
    nextParts.push(nextPart);
  } else {
    nextParts[existingIndex] = nextPart;
  }

  return nextParts;
}

function appendTextPart(
  parts: LiveAssistantParts,
  payload: Record<string, unknown>
): LiveAssistantParts {
  const text = typeof payload.text === "string" ? payload.text : "";
  if (!text) return parts;

  const nextParts = [...parts];
  const lastPart = nextParts[nextParts.length - 1] as any;
  if (!lastPart || lastPart.type !== "text") {
    nextParts.push({ type: "text", text } as LiveAssistantParts[number]);
    return nextParts;
  }

  nextParts[nextParts.length - 1] = {
    type: "text",
    text: `${String(lastPart.text ?? "")}${text}`,
  } as LiveAssistantParts[number];
  return nextParts;
}

function nextPreviewState(
  current: ChatTurnRunLivePreviewState,
  payload: Record<string, unknown>
): ChatTurnRunLivePreviewState {
  const revisionId = Number(payload.revisionId ?? 0);
  const revisionNumber = Number(payload.revisionNumber ?? 0);
  if (!revisionId || !revisionNumber) return current;
  return { revisionId, revisionNumber };
}

export async function applyStreamEventsToChatTurnRunLiveState(params: {
  runId: string;
  chatId: number;
  userId: number;
  events: StreamEventEnvelope[];
}) {
  if (!params.runId || !Array.isArray(params.events) || params.events.length === 0) {
    return null;
  }

  const existing = await getChatTurnRunLiveStateByRunId(params.runId);
  let status = existing?.status ?? "running";
  let assistantParts = normalizeAssistantParts(existing?.assistantParts);
  let previewState = (existing?.previewState ?? null) as ChatTurnRunLivePreviewState;
  let lastLogicalEventId = Number(existing?.lastLogicalEventId ?? 0);
  let lastEventCreatedAt = existing?.lastEventCreatedAt ?? null;
  let completedAt = existing?.completedAt ?? null;

  for (const event of params.events) {
    const payload = event.payload ?? {};
    lastLogicalEventId = Math.max(lastLogicalEventId, event.logicalEventId);
    lastEventCreatedAt = new Date(event.createdAt);

    switch (event.eventType) {
      case "run_started":
        status = "running";
        break;
      case "text_delta":
        assistantParts = appendTextPart(assistantParts, payload);
        break;
      case "tool_call":
        assistantParts = upsertToolCallPart(assistantParts, payload);
        break;
      case "tool_result":
        assistantParts = upsertToolResultPart(assistantParts, payload);
        break;
      case "preview_update":
        previewState = nextPreviewState(previewState, payload);
        break;
      case "run_completed":
        status = "completed";
        completedAt = new Date(event.createdAt);
        break;
      case "run_failed":
        status = "failed";
        completedAt = new Date(event.createdAt);
        break;
      case "run_canceled":
        status = "canceled";
        completedAt = new Date(event.createdAt);
        break;
    }
  }

  return upsertChatTurnRunLiveState({
    runId: params.runId,
    chatId: params.chatId,
    userId: params.userId,
    status,
    assistantParts,
    previewState,
    lastLogicalEventId,
    lastEventCreatedAt,
    completedAt,
  });
}
