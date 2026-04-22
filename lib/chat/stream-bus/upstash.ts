import { Redis } from "@upstash/redis";
import type {
  PublishEventsParams,
  ReadEventsAfterParams,
  StreamBusAdapter,
  StreamEventEnvelope,
} from "./types";

const STREAM_KEY_PREFIX = "chat-stream-events";
const STREAM_INDEX_KEY_PREFIX = "chat-stream-events-index";
const STREAM_PAYLOAD_KEY_PREFIX = "chat-stream-events-payload";
const PUBLISH_EVENT_LUA = `
local streamId = redis.call(
  'XADD',
  KEYS[1],
  '*',
  'dbId',
  ARGV[1],
  'logicalEventId',
  ARGV[2],
  'chatId',
  ARGV[3],
  'runId',
  ARGV[4],
  'eventType',
  ARGV[5],
  'payload',
  ARGV[6],
  'createdAt',
  ARGV[7]
)
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[2])
redis.call('HSET', KEYS[3], ARGV[2], ARGV[8])
return streamId
`;

let redisClient: Redis | null = null;
let redisConnectivityCheck: Promise<void> | null = null;

function getRedisUrlAndSource(): { url: string | null; source: string } {
  if (process.env.STORAGE_KV_REST_API_URL) {
    return { url: process.env.STORAGE_KV_REST_API_URL, source: "STORAGE_KV_REST_API_URL" };
  }
  if (process.env.UPSTASH_REDIS_REST_URL) {
    return { url: process.env.UPSTASH_REDIS_REST_URL, source: "UPSTASH_REDIS_REST_URL" };
  }
  if (process.env.KV_REST_API_URL) {
    return { url: process.env.KV_REST_API_URL, source: "KV_REST_API_URL" };
  }
  return { url: null, source: "fromEnv" };
}

function getRedisHostLabel(url: string | null): string {
  if (!url) return "unknown";
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

async function logRedisConnectivityOnce(redis: Redis): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;
  if (redisConnectivityCheck) {
    await redisConnectivityCheck;
    return;
  }

  redisConnectivityCheck = (async () => {
    const startedAt = Date.now();
    const { url, source } = getRedisUrlAndSource();
    const host = getRedisHostLabel(url);
    try {
      if (typeof (redis as any).ping === "function") {
        await (redis as any).ping();
        console.info("[stream-bus] Redis connectivity check passed", {
          source,
          host,
          latencyMs: Date.now() - startedAt,
        });
      } else {
        console.info("[stream-bus] Redis client initialized (ping unavailable)", {
          source,
          host,
        });
      }
    } catch (error) {
      console.error("[stream-bus] Redis connectivity check failed", {
        source,
        host,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  await redisConnectivityCheck;
}

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

function getStreamIndexKey(chatId: number): string {
  return `${STREAM_INDEX_KEY_PREFIX}:${chatId}`;
}

function getStreamPayloadKey(chatId: number): string {
  return `${STREAM_PAYLOAD_KEY_PREFIX}:${chatId}`;
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) return 100;
  return Math.min(Math.floor(limit), 500);
}

function parsePayload(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "object") return raw as Record<string, unknown>;
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

function parseSerializedEnvelope(raw: unknown): StreamEventEnvelope | null {
  if (raw == null) return null;
  try {
    // Upstash REST client auto-deserializes JSON, so raw may already be an object
    const parsed =
      typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const envelope = parsed as Partial<StreamEventEnvelope>;
    const dbId = Number(envelope.dbId);
    const logicalEventId = Number(envelope.logicalEventId);
    const chatId = Number(envelope.chatId);
    const runId = typeof envelope.runId === "string" ? envelope.runId : "";
    const eventType =
      typeof envelope.eventType === "string" ? envelope.eventType : "";
    const createdAt =
      envelope.createdAt instanceof Date || typeof envelope.createdAt === "string"
        ? envelope.createdAt
        : new Date().toISOString();
    const payload =
      envelope.payload && typeof envelope.payload === "object"
        ? (envelope.payload as Record<string, unknown>)
        : {};

    if (!dbId || !logicalEventId || !chatId || !runId || !eventType) {
      return null;
    }

    return {
      dbId,
      logicalEventId,
      chatId,
      runId,
      eventType,
      payload,
      createdAt,
    };
  } catch {
    return null;
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

function parseXRangeEntry(rawId: string, rawFields: unknown): StreamEventEnvelope | null {
  if (typeof rawId !== "string") return null;
  const fields = parseXRangeFields(rawFields);
  const dbId = Number(fields.dbId ?? fields.id ?? 0);
  const logicalEventId = Number(fields.logicalEventId ?? 0);
  const chatId = Number(fields.chatId ?? 0);
  const runId = fields.runId ?? "";
  const eventType = fields.eventType ?? "";
  const createdAt = fields.createdAt ?? new Date().toISOString();
  if (!dbId || !logicalEventId || !chatId || !runId || !eventType) return null;

  return {
    dbId,
    logicalEventId,
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
  await logRedisConnectivityOnce(redis);
  const streamKey = getStreamKey(params.chatId);
  const streamIndexKey = getStreamIndexKey(params.chatId);
  const streamPayloadKey = getStreamPayloadKey(params.chatId);
  const published: StreamEventEnvelope[] = [];
  if (!Array.isArray(params.events) || params.events.length === 0) {
    return published;
  }

  for (const event of params.events) {
    const dbId = Number(event.dbId);
    const logicalEventId = Number(event.logicalEventId);
    if (!Number.isFinite(dbId) || dbId <= 0) {
      throw new Error("Redis publish requires a positive dbId");
    }
    if (!Number.isFinite(logicalEventId) || logicalEventId <= 0) {
      throw new Error("Redis publish requires a positive logicalEventId");
    }
    const createdAt =
      event.createdAt instanceof Date
        ? event.createdAt.toISOString()
        : typeof event.createdAt === "string"
          ? event.createdAt
          : new Date().toISOString();
    const serializedEnvelope = JSON.stringify({
      dbId,
      logicalEventId,
      chatId: params.chatId,
      runId: params.runId,
      eventType: event.eventType,
      payload: event.payload ?? {},
      createdAt,
    } satisfies StreamEventEnvelope);
    await redis.eval(
      PUBLISH_EVENT_LUA,
      [streamKey, streamIndexKey, streamPayloadKey],
      [
        String(dbId),
        String(logicalEventId),
        String(params.chatId),
        params.runId,
        event.eventType,
        JSON.stringify(event.payload ?? {}),
        createdAt,
        serializedEnvelope,
      ]
    );
    published.push({
      dbId,
      logicalEventId,
      chatId: params.chatId,
      runId: params.runId,
      eventType: event.eventType,
      payload: event.payload ?? {},
      createdAt,
    });
  }

  return published;
}

async function readEventsAfter(
  params: ReadEventsAfterParams
): Promise<StreamEventEnvelope[]> {
  const redis = getRedis();
  await logRedisConnectivityOnce(redis);
  const streamKey = getStreamKey(params.chatId);
  const streamIndexKey = getStreamIndexKey(params.chatId);
  const streamPayloadKey = getStreamPayloadKey(params.chatId);
  const limit = normalizeLimit(params.limit);
  const afterLogicalEventId = Math.max(0, Math.floor(params.afterLogicalEventId));
  const members = await redis.zrange<string[]>(
    streamIndexKey,
    `(${afterLogicalEventId}`,
    "+inf",
    {
      byScore: true,
      offset: 0,
      count: limit,
    }
  );

  const parsed: StreamEventEnvelope[] = [];
  if (!Array.isArray(members) || members.length === 0) {
    return parsed;
  }

  const normalizedMembers = members
    .map((member) => String(member ?? "").trim())
    .filter((member) => member.length > 0);
  const logicalIds = normalizedMembers.filter((member) => !member.includes("-"));
  const legacyStreamIds = normalizedMembers.filter((member) =>
    member.includes("-")
  );

  if (logicalIds.length > 0) {
    const hmgetRaw = await (redis as any).hmget(streamPayloadKey, ...logicalIds);
    const normalizedPayloads: unknown[] = Array.isArray(hmgetRaw)
      ? hmgetRaw
      : logicalIds.map((id) =>
          hmgetRaw && typeof hmgetRaw === "object"
            ? (hmgetRaw as Record<string, unknown>)[id]
            : null
        );
    for (const rawPayload of normalizedPayloads) {
      const envelope = parseSerializedEnvelope(rawPayload);
      if (envelope) {
        parsed.push(envelope);
      }
    }
  }

  if (legacyStreamIds.length > 0) {
    const pipe = (redis as any).pipeline();
    for (const streamId of legacyStreamIds) {
      pipe.xrange(streamKey, streamId, streamId, 1);
    }
    const legacyRawEntries = await pipe.exec();
    const legacyParsed = (Array.isArray(legacyRawEntries) ? legacyRawEntries : [])
      .flatMap((raw) =>
        raw && typeof raw === "object"
          ? Object.entries(raw as Record<string, unknown>)
          : []
      )
      .map(([streamId, fields]) => parseXRangeEntry(streamId, fields))
      .filter((e): e is StreamEventEnvelope => Boolean(e));
    parsed.push(...legacyParsed);
  }

  parsed.sort((a, b) => a.logicalEventId - b.logicalEventId);

  return parsed
    .filter((evt) => evt.logicalEventId > afterLogicalEventId)
    .slice(0, limit);
}

export const upstashStreamBusAdapter: StreamBusAdapter = {
  publishEvents,
  readEventsAfter,
};
