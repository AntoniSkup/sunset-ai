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
  const rows = await appendChatStreamEvents({
    chatId: params.chatId,
    runId: params.runId,
    events: params.events,
  });

  return rows.map((row) => ({
    dbId: row.id,
    logicalEventId: row.logicalEventId,
    chatId: row.chatId,
    runId: row.runId,
    eventType: row.eventType,
    payload: row.payload,
    createdAt: row.createdAt,
  }));
}

async function readEventsAfter(
  params: ReadEventsAfterParams
): Promise<StreamEventEnvelope[]> {
  const rows = await getChatStreamEventsAfter({
    chatId: params.chatId,
    afterEventId: Math.min(
      MAX_DB_EVENT_ID,
      Math.max(0, Math.floor(params.afterLogicalEventId))
    ),
    limit: normalizeLimit(params.limit),
  });

  return rows.map((row) => ({
    dbId: row.id,
    logicalEventId: row.logicalEventId,
    chatId: row.chatId,
    runId: row.runId,
    eventType: row.eventType,
    payload: row.payload,
    createdAt: row.createdAt,
  }));
}

export const dbStreamBusAdapter: StreamBusAdapter = {
  publishEvents,
  readEventsAfter,
};
