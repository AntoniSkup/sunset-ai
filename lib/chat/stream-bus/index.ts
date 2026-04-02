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

function isRedisTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("Redis stream op timed out after ")
  );
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
  const dbEvents = await dbStreamBusAdapter.publishEvents(params);
  const redisEnabled = shouldUseRedisStreamBus();
  const redisWriteUnavailable = isRedisWriteTemporarilyUnavailable();

  if (!redisEnabled || redisWriteUnavailable) {
    if (!STREAM_BUS_DB_FALLBACK) {
      const reason = !redisEnabled
        ? "redis-disabled-or-unconfigured"
        : "redis-write-temporarily-unavailable";
      console.error("[stream-bus] strict:publish-blocked", {
        chatId: params.chatId,
        runId: params.runId,
        reason,
        fallbackEnabled: STREAM_BUS_DB_FALLBACK,
      });
      throw new Error(
        !redisEnabled
          ? "Redis stream bus is not configured or disabled while DB fallback is disabled"
          : "Redis stream write temporarily unavailable while DB fallback is disabled"
      );
    }
    debugStreamBus("publish:db-direct", {
      chatId: params.chatId,
      runId: params.runId,
      events: params.events.length,
      firstLogicalEventId: dbEvents[0]?.logicalEventId ?? null,
      lastLogicalEventId: dbEvents[dbEvents.length - 1]?.logicalEventId ?? null,
      redisTemporarilyUnavailable: redisWriteUnavailable,
    });
    return dbEvents;
  }

  const redisPublishParams =
    dbEvents.length === params.events.length
      ? {
          ...params,
          events: dbEvents.map((event) => ({
            dbId: event.dbId,
            logicalEventId: event.logicalEventId,
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
      firstLogicalEventId: events[0]?.logicalEventId ?? null,
      lastLogicalEventId: events[events.length - 1]?.logicalEventId ?? null,
    });
    return dbEvents;
  } catch (error) {
    markRedisTemporarilyUnavailable();
    if (!STREAM_BUS_DB_FALLBACK) {
      console.error("[stream-bus] strict:publish-failed", {
        chatId: params.chatId,
        runId: params.runId,
        timeout: isRedisTimeoutError(error),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    console.error("Redis stream publish failed after DB commit:", error);
    debugStreamBus("publish:db-fallback", {
      chatId: params.chatId,
      runId: params.runId,
      events: params.events.length,
      firstLogicalEventId: dbEvents[0]?.logicalEventId ?? null,
      lastLogicalEventId: dbEvents[dbEvents.length - 1]?.logicalEventId ?? null,
    });
    return dbEvents;
  }
}

export async function readStreamEventsAfter(
  params: ReadEventsAfterParams
): Promise<StreamEventEnvelope[]> {
  const redisTemporarilyUnavailable = isRedisReadTemporarilyUnavailable();
  const redisEnabled = shouldUseRedisStreamBus();
  if (!redisEnabled || redisTemporarilyUnavailable) {
    if (!STREAM_BUS_DB_FALLBACK) {
      const reason = !redisEnabled
        ? "redis-disabled-or-unconfigured"
        : "redis-read-temporarily-unavailable";
      console.error("[stream-bus] strict:read-blocked", {
        chatId: params.chatId,
        afterLogicalEventId: params.afterLogicalEventId,
        limit: params.limit,
        reason,
        fallbackEnabled: STREAM_BUS_DB_FALLBACK,
      });
      throw new Error(
        !redisEnabled
          ? "Redis stream bus is not configured or disabled while DB fallback is disabled"
          : "Redis stream temporarily unavailable while DB fallback is disabled"
      );
    }
    const events = await dbStreamBusAdapter.readEventsAfter(params);
    debugStreamBus("read:db-direct", {
      chatId: params.chatId,
      afterLogicalEventId: params.afterLogicalEventId,
      limit: params.limit,
      returned: events.length,
      firstLogicalEventId: events[0]?.logicalEventId ?? null,
      lastLogicalEventId: events[events.length - 1]?.logicalEventId ?? null,
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
          afterLogicalEventId: params.afterLogicalEventId,
          limit: params.limit,
          returned: dbEvents.length,
          firstLogicalEventId: dbEvents[0]?.logicalEventId ?? null,
          lastLogicalEventId: dbEvents[dbEvents.length - 1]?.logicalEventId ?? null,
        });
        return dbEvents;
      }
    }
    debugStreamBus("read:redis", {
      chatId: params.chatId,
      afterLogicalEventId: params.afterLogicalEventId,
      limit: params.limit,
      returned: events.length,
      firstLogicalEventId: events[0]?.logicalEventId ?? null,
      lastLogicalEventId: events[events.length - 1]?.logicalEventId ?? null,
    });
    return events;
  } catch (error) {
    // Only enter read cooldown for transient infra failures.
    if (isRedisTimeoutError(error)) {
      markRedisReadUnavailable();
    }
    if (!STREAM_BUS_DB_FALLBACK) {
      console.error("[stream-bus] strict:read-failed", {
        chatId: params.chatId,
        afterLogicalEventId: params.afterLogicalEventId,
        limit: params.limit,
        timeout: isRedisTimeoutError(error),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    if (isRedisTimeoutError(error)) {
      debugStreamBus("read:db-fallback-timeout", {
        chatId: params.chatId,
        afterLogicalEventId: params.afterLogicalEventId,
        limit: params.limit,
        timeoutMs: REDIS_STREAM_READ_TIMEOUT_MS,
      });
    } else {
      console.error("Redis stream read failed, falling back to DB:", error);
    }
    const events = await dbStreamBusAdapter.readEventsAfter(params);
    debugStreamBus("read:db-fallback", {
      chatId: params.chatId,
      afterLogicalEventId: params.afterLogicalEventId,
      limit: params.limit,
      returned: events.length,
      firstLogicalEventId: events[0]?.logicalEventId ?? null,
      lastLogicalEventId: events[events.length - 1]?.logicalEventId ?? null,
    });
    return events;
  }
}

export function isStreamBusDebugEnabled(): boolean {
  return STREAM_BUS_DEBUG_ENABLED;
}
