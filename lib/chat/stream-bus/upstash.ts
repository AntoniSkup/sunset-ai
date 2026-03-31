import { Redis } from "@upstash/redis";
import type {
  PublishEventsParams,
  ReadEventsAfterParams,
  StreamBusAdapter,
  StreamEventEnvelope,
} from "./types";

const STREAM_KEY_PREFIX = "chat-stream-events";
const COUNTER_KEY_PREFIX = "chat-stream-events-seq";

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (redisClient) return redisClient;
  const url =
    process.env.STORAGE_KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL;
  const token =
    process.env.STORAGE_KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN;

  if (url && token) {
    redisClient = new Redis({ url, token });
  } else {
    redisClient = Redis.fromEnv();
  }
  return redisClient;
}

function getStreamKey(chatId: number): string {
  return `${STREAM_KEY_PREFIX}:${chatId}`;
}

function getCounterKey(chatId: number): string {
  return `${COUNTER_KEY_PREFIX}:${chatId}`;
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 100;
  return Math.min(Math.floor(limit), 500);
}

function parsePayload(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function parseXRangeFields(fields: unknown): Record<string, string> {
  if (Array.isArray(fields)) {
    const out: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      const k = fields[i];
      const v = fields[i + 1];
      if (typeof k === "string") out[k] = typeof v === "string" ? v : String(v ?? "");
    }
    return out;
  }
  if (fields && typeof fields === "object") {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
      out[k] = typeof v === "string" ? v : String(v ?? "");
    }
    return out;
  }
  return {};
}

function streamIdToNumericId(streamId: string): number {
  const base = streamId.split("-")[0];
  const asNumber = Number(base);
  return Number.isFinite(asNumber) ? asNumber : 0;
}

function parseXRangeEntry(rawId: string, rawFields: unknown): StreamEventEnvelope | null {
  if (typeof rawId !== "string") return null;
  const fields = parseXRangeFields(rawFields);
  const id = Number(fields.id ?? streamIdToNumericId(rawId));
  const chatId = Number(fields.chatId ?? 0);
  const runId = fields.runId ?? "";
  const eventType = fields.eventType ?? "";
  const createdAt = fields.createdAt ?? new Date().toISOString();
  if (!id || !chatId || !runId || !eventType) return null;

  return {
    id,
    chatId,
    runId,
    eventType,
    payload: parsePayload(fields.payload),
    createdAt,
  };
}

async function publishEvents(
  params: PublishEventsParams
): Promise<StreamEventEnvelope[]> {
  const redis = getRedis();
  const streamKey = getStreamKey(params.chatId);
  const counterKey = getCounterKey(params.chatId);
  const published: StreamEventEnvelope[] = [];
  if (!Array.isArray(params.events) || params.events.length === 0) {
    return published;
  }

  const pipe = (redis as any).pipeline();

  for (const event of params.events) {
    const seq = Number(await redis.incr(counterKey));
    const id = Number.isFinite(event.id) ? Number(event.id) : seq;
    const streamId = `${id}-0`;
    const createdAt =
      event.createdAt instanceof Date
        ? event.createdAt.toISOString()
        : typeof event.createdAt === "string"
          ? event.createdAt
          : new Date().toISOString();
    pipe.xadd(streamKey, streamId, {
      id: String(id),
      chatId: String(params.chatId),
      runId: params.runId,
      eventType: event.eventType,
      payload: JSON.stringify(event.payload ?? {}),
      createdAt,
    });
    published.push({
      id,
      chatId: params.chatId,
      runId: params.runId,
      eventType: event.eventType,
      payload: event.payload ?? {},
      createdAt,
    });
  }

  await pipe.exec();
  return published;
}

async function readEventsAfter(
  params: ReadEventsAfterParams
): Promise<StreamEventEnvelope[]> {
  const redis = getRedis();
  const streamKey = getStreamKey(params.chatId);
  const limit = normalizeLimit(params.limit);
  const afterId = Math.max(0, Math.floor(params.afterEventId));
  const startId = `${afterId}-0`;

  const raw = await (redis as any).xrange(streamKey, startId, "+", limit + 1);
  const parsed =
    raw && typeof raw === "object"
      ? Object.entries(raw as Record<string, unknown>)
          .map(([streamId, fields]) => parseXRangeEntry(streamId, fields))
          .filter((e): e is StreamEventEnvelope => Boolean(e))
      : [];

  return parsed.filter((evt) => evt.id > afterId).slice(0, limit);
}

export const upstashStreamBusAdapter: StreamBusAdapter = {
  publishEvents,
  readEventsAfter,
};
