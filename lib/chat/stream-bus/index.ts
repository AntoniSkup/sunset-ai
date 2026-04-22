import { dbStreamBusAdapter } from "./db";
import { upstashStreamBusAdapter } from "./upstash";
import type {
  PublishEventsParams,
  ReadEventsAfterParams,
  StreamEventEnvelope,
} from "./types";
import { logStreamBusDiagnostic } from "../stream-diagnostics";

const ENABLE_REDIS_STREAM_BUS = process.env.ENABLE_REDIS_STREAM_BUS === "1";
const STREAM_BUS_DB_FALLBACK = process.env.STREAM_BUS_DB_FALLBACK !== "0";
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
let hasLoggedRedisDisabled = false;

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

function logRedisUnavailable(reason: string) {
  if (process.env.NODE_ENV !== "production") return;
  if (hasLoggedRedisDisabled) return;
  hasLoggedRedisDisabled = true;
  console.warn("[stream-bus] Redis stream bus unavailable, using DB fallback", {
    reason,
    streamBusEnabled: ENABLE_REDIS_STREAM_BUS,
    hasUpstashEnv: hasUpstashEnv(),
    dbFallbackEnabled: STREAM_BUS_DB_FALLBACK,
  });
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
  const startedAt = Date.now();
  const dbEvents = await dbStreamBusAdapter.publishEvents(params);
  const redisEnabled = shouldUseRedisStreamBus();
  const redisWriteUnavailable = isRedisWriteTemporarilyUnavailable();

  if (!redisEnabled || redisWriteUnavailable) {
    if (!redisEnabled) {
      logRedisUnavailable("redis disabled or env missing");
    } else if (redisWriteUnavailable) {
      logRedisUnavailable("redis write cooldown active");
    }
    if (!STREAM_BUS_DB_FALLBACK) {
      throw new Error(
        !redisEnabled
          ? "Redis stream bus is not configured or disabled while DB fallback is disabled"
          : "Redis stream write temporarily unavailable while DB fallback is disabled"
      );
    }
    logStreamBusDiagnostic("Publish returned DB-only events", {
      chatId: params.chatId,
      runId: params.runId,
      eventCount: dbEvents.length,
      redisEnabled,
      redisWriteUnavailable,
      dbFallbackEnabled: STREAM_BUS_DB_FALLBACK,
      durationMs: Date.now() - startedAt,
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
    await withTimeout(
      upstashStreamBusAdapter.publishEvents(redisPublishParams),
      REDIS_STREAM_WRITE_TIMEOUT_MS
    );
    const durationMs = Date.now() - startedAt;
    if (durationMs >= 250 || dbEvents.length > 1) {
      logStreamBusDiagnostic("Published events to Redis", {
        chatId: params.chatId,
        runId: params.runId,
        eventCount: dbEvents.length,
        durationMs,
      });
    }
    return dbEvents;
  } catch (error) {
    markRedisTemporarilyUnavailable();
    if (process.env.NODE_ENV === "production") {
      console.error("[stream-bus] Redis publish failed, switched to cooldown", {
        dbFallbackEnabled: STREAM_BUS_DB_FALLBACK,
        cooldownMs: REDIS_STREAM_COOLDOWN_MS,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (!STREAM_BUS_DB_FALLBACK) {
      throw error;
    }
    logStreamBusDiagnostic("Redis publish failed and fell back to DB", {
      chatId: params.chatId,
      runId: params.runId,
      eventCount: dbEvents.length,
      durationMs: Date.now() - startedAt,
      cooldownMs: REDIS_STREAM_COOLDOWN_MS,
      error: error instanceof Error ? error.message : String(error),
    });
    return dbEvents;
  }
}

export async function readStreamEventsAfter(
  params: ReadEventsAfterParams
): Promise<StreamEventEnvelope[]> {
  const startedAt = Date.now();
  const redisTemporarilyUnavailable = isRedisReadTemporarilyUnavailable();
  const redisEnabled = shouldUseRedisStreamBus();
  if (!redisEnabled || redisTemporarilyUnavailable) {
    if (!redisEnabled) {
      logRedisUnavailable("redis disabled or env missing");
    } else if (redisTemporarilyUnavailable) {
      logRedisUnavailable("redis read cooldown active");
    }
    if (!STREAM_BUS_DB_FALLBACK) {
      throw new Error(
        !redisEnabled
          ? "Redis stream bus is not configured or disabled while DB fallback is disabled"
          : "Redis stream temporarily unavailable while DB fallback is disabled"
      );
    }
    const events = await dbStreamBusAdapter.readEventsAfter(params);
    logStreamBusDiagnostic("Read events via DB fallback", {
      chatId: params.chatId,
      afterLogicalEventId: params.afterLogicalEventId,
      eventCount: events.length,
      redisEnabled,
      redisTemporarilyUnavailable,
      durationMs: Date.now() - startedAt,
    });
    return events;
  }

  try {
    const events = await withTimeout(
      upstashStreamBusAdapter.readEventsAfter(params),
      REDIS_STREAM_READ_TIMEOUT_MS
    );
    const durationMs = Date.now() - startedAt;
    if (durationMs >= 250 || events.length > 0) {
      logStreamBusDiagnostic("Read events via Redis", {
        chatId: params.chatId,
        afterLogicalEventId: params.afterLogicalEventId,
        eventCount: events.length,
        durationMs,
      });
    }
    if (events.length === 0 && STREAM_BUS_DB_FALLBACK) {
      const dbEvents = await dbStreamBusAdapter.readEventsAfter(params);
      if (dbEvents.length > 0) {
        logStreamBusDiagnostic("Redis empty, DB had pending events", {
          chatId: params.chatId,
          afterLogicalEventId: params.afterLogicalEventId,
          dbEventCount: dbEvents.length,
          durationMs: Date.now() - startedAt,
        });
        return dbEvents;
      }
    }
    return events;
  } catch (error) {
    // Only enter read cooldown for transient infra failures.
    if (isRedisTimeoutError(error)) {
      markRedisReadUnavailable();
    }
    if (process.env.NODE_ENV === "production") {
      console.error("[stream-bus] Redis read failed, using DB fallback", {
        dbFallbackEnabled: STREAM_BUS_DB_FALLBACK,
        readCooldownMs: REDIS_STREAM_COOLDOWN_MS,
        timeout: isRedisTimeoutError(error),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (!STREAM_BUS_DB_FALLBACK) {
      throw error;
    }
    const events = await dbStreamBusAdapter.readEventsAfter(params);
    logStreamBusDiagnostic("Redis read failed and used DB fallback", {
      chatId: params.chatId,
      afterLogicalEventId: params.afterLogicalEventId,
      eventCount: events.length,
      durationMs: Date.now() - startedAt,
      timeout: isRedisTimeoutError(error),
      error: error instanceof Error ? error.message : String(error),
    });
    return events;
  }
}
