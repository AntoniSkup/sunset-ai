import {
  appendChatStreamEvents,
  getChatStreamEventsAfter,
} from "@/lib/db/queries";
import type {
  PublishEventsParams,
  ReadEventsAfterParams,
  StreamBusAdapter,
  StreamEventEnvelope,
} from "./types";

const MAX_DB_EVENT_ID = 2147483647;

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 100;
  return Math.min(Math.floor(limit), 500);
}

async function publishEvents(
  params: PublishEventsParams
): Promise<StreamEventEnvelope[]> {
  return appendChatStreamEvents({
    chatId: params.chatId,
    runId: params.runId,
    events: params.events,
  });
}

async function readEventsAfter(
  params: ReadEventsAfterParams
): Promise<StreamEventEnvelope[]> {
  return getChatStreamEventsAfter({
    chatId: params.chatId,
    afterEventId: Math.min(
      MAX_DB_EVENT_ID,
      Math.max(0, Math.floor(params.afterEventId))
    ),
    limit: normalizeLimit(params.limit),
  });
}

export const dbStreamBusAdapter: StreamBusAdapter = {
  publishEvents,
  readEventsAfter,
};
