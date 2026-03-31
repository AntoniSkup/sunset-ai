import { dbStreamBusAdapter } from "./db";
import { upstashStreamBusAdapter } from "./upstash";
import type {
  PublishEventsParams,
  ReadEventsAfterParams,
  StreamEventEnvelope,
} from "./types";

const ENABLE_REDIS_STREAM_BUS = process.env.ENABLE_REDIS_STREAM_BUS === "1";
const STREAM_BUS_DB_FALLBACK = process.env.STREAM_BUS_DB_FALLBACK !== "0";
const STREAM_BUS_DEBUG_ENABLED = process.env.DEBUG_STREAM_BUS === "1";
const REDIS_STREAM_READ_TIMEOUT_MS = Number(
  process.env.REDIS_STREAM_READ_TIMEOUT_MS ??
    process.env.REDIS_STREAM_OP_TIMEOUT_MS ??
    "1500"
);
const REDIS_STREAM_WRITE_TIMEOUT_MS = Number(
  process.env.REDIS_STREAM_WRITE_TIMEOUT_MS ??
    process.env.REDIS_STREAM_OP_TIMEOUT_MS ??
    "7000"
);
const REDIS_STREAM_COOLDOWN_MS = Number(
  process.env.REDIS_STREAM_COOLDOWN_MS ?? "20000"
);

let redisReadUnavailableUntilMs = 0;
let redisWriteUnavailableUntilMs = 0;

function debugStreamBus(message: string, payload?: Record<string, unknown>) {
  if (!STREAM_BUS_DEBUG_ENABLED) return;
  if (payload) {
    console.log(`[stream-bus] ${message}`, payload);
    return;
  }
  console.log(`[stream-bus] ${message}`);
}

function hasUpstashEnv(): boolean {
  return Boolean(
    (process.env.STORAGE_KV_REST_API_URL &&
      process.env.STORAGE_KV_REST_API_TOKEN) ||
      (process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN) ||
      (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  );
}

function shouldUseRedisStreamBus(): boolean {
  return ENABLE_REDIS_STREAM_BUS && hasUpstashEnv();
}

function isRedisReadTemporarilyUnavailable(): boolean {
  return Date.now() < redisReadUnavailableUntilMs;
}

function isRedisWriteTemporarilyUnavailable(): boolean {
  return Date.now() < redisWriteUnavailableUntilMs;
}

function markRedisReadUnavailable() {
  redisReadUnavailableUntilMs = Date.now() + REDIS_STREAM_COOLDOWN_MS;
}

function markRedisWriteUnavailable() {
  redisWriteUnavailableUntilMs = Date.now() + REDIS_STREAM_COOLDOWN_MS;
}

function markRedisTemporarilyUnavailable() {
  markRedisReadUnavailable();
  markRedisWriteUnavailable();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Redis stream op timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function publishStreamEvents(
  params: PublishEventsParams
): Promise<StreamEventEnvelope[]> {
  if (!shouldUseRedisStreamBus() || isRedisWriteTemporarilyUnavailable()) {
    debugStreamBus("publish:db-direct", {
      chatId: params.chatId,
      runId: params.runId,
      events: params.events.length,
      redisTemporarilyUnavailable: isRedisWriteTemporarilyUnavailable(),
    });
    return dbStreamBusAdapter.publishEvents(params);
  }

  let dbMirroredEvents: StreamEventEnvelope[] | null = null;
  if (STREAM_BUS_DB_FALLBACK) {
    try {
      dbMirroredEvents = await dbStreamBusAdapter.publishEvents(params);
    } catch (error) {
      console.error("DB mirror publish failed for stream bus:", error);
    }
  }

  const redisPublishParams =
    dbMirroredEvents && dbMirroredEvents.length === params.events.length
      ? {
          ...params,
          events: dbMirroredEvents.map((event) => ({
            id: event.id,
            eventType: event.eventType,
            payload: event.payload,
            createdAt: event.createdAt,
          })),
        }
      : params;

  try {
    const events = await withTimeout(
      upstashStreamBusAdapter.publishEvents(redisPublishParams),
      REDIS_STREAM_WRITE_TIMEOUT_MS
    );
    debugStreamBus("publish:redis", {
      chatId: params.chatId,
      runId: params.runId,
      events: params.events.length,
      firstId: events[0]?.id ?? null,
      lastId: events[events.length - 1]?.id ?? null,
      mirroredToDb: STREAM_BUS_DB_FALLBACK,
    });
    if (dbMirroredEvents) {
      return dbMirroredEvents;
    }
    return events;
  } catch (error) {
    markRedisTemporarilyUnavailable();
    if (!STREAM_BUS_DB_FALLBACK) throw error;
    console.error("Redis stream publish failed, falling back to DB:", error);
    debugStreamBus("publish:db-fallback", {
      chatId: params.chatId,
      runId: params.runId,
      events: params.events.length,
    });
    if (dbMirroredEvents) {
      return dbMirroredEvents;
    }
    return dbStreamBusAdapter.publishEvents(params);
  }
}

export async function readStreamEventsAfter(
  params: ReadEventsAfterParams
): Promise<StreamEventEnvelope[]> {
  const redisTemporarilyUnavailable =
    isRedisReadTemporarilyUnavailable() || isRedisWriteTemporarilyUnavailable();
  if (!shouldUseRedisStreamBus() || redisTemporarilyUnavailable) {
    const events = await dbStreamBusAdapter.readEventsAfter(params);
    debugStreamBus("read:db-direct", {
      chatId: params.chatId,
      afterEventId: params.afterEventId,
      limit: params.limit,
      returned: events.length,
      redisTemporarilyUnavailable,
    });
    return events;
  }

  try {
    const events = await withTimeout(
      upstashStreamBusAdapter.readEventsAfter(params),
      REDIS_STREAM_READ_TIMEOUT_MS
    );
    if (events.length === 0 && STREAM_BUS_DB_FALLBACK) {
      const dbEvents = await dbStreamBusAdapter.readEventsAfter(params);
      if (dbEvents.length > 0) {
        debugStreamBus("read:db-on-empty-redis", {
          chatId: params.chatId,
          afterEventId: params.afterEventId,
          limit: params.limit,
          returned: dbEvents.length,
        });
        return dbEvents;
      }
    }
    debugStreamBus("read:redis", {
      chatId: params.chatId,
      afterEventId: params.afterEventId,
      limit: params.limit,
      returned: events.length,
      firstId: events[0]?.id ?? null,
      lastId: events[events.length - 1]?.id ?? null,
    });
    return events;
  } catch (error) {
    markRedisTemporarilyUnavailable();
    if (!STREAM_BUS_DB_FALLBACK) throw error;
    console.error("Redis stream read failed, falling back to DB:", error);
    const events = await dbStreamBusAdapter.readEventsAfter(params);
    debugStreamBus("read:db-fallback", {
      chatId: params.chatId,
      afterEventId: params.afterEventId,
      limit: params.limit,
      returned: events.length,
    });
    return events;
  }
}

export function isStreamBusDebugEnabled(): boolean {
  return STREAM_BUS_DEBUG_ENABLED;
}

export { shouldUseRedisStreamBus };
