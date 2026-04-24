import { dbStreamBusAdapter } from "./db";
import { upstashStreamBusAdapter } from "./upstash";
import type {
  PublishEventsParams,
  PublishStreamEventsOptions,
  ReadEventsAfterParams,
  StreamEventEnvelope,
} from "./types";

const ENABLE_REDIS_STREAM_BUS = process.env.ENABLE_REDIS_STREAM_BUS === "1";
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
  console.warn("[stream-bus] Redis stream bus unavailable (strict mode)", {
    reason,
    streamBusEnabled: ENABLE_REDIS_STREAM_BUS,
    hasUpstashEnv: hasUpstashEnv(),
  });
}

function assertRedisEnabled() {
  if (!ENABLE_REDIS_STREAM_BUS || !hasUpstashEnv()) {
    throw new Error(
      "Redis stream bus is required but not configured (ENABLE_REDIS_STREAM_BUS=1 and Upstash env vars are required)"
    );
  }
}

function isRedisTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.startsWith("Redis stream op timed out after ")
  );
}

function isRedisAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toUpperCase();
  return (
    message.includes("WRONGPASS") ||
    message.includes("NOAUTH") ||
    message.includes("INVALID USERNAME-PASSWORD PAIR") ||
    message.includes("USER IS DISABLED")
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
  params: PublishEventsParams,
  options?: PublishStreamEventsOptions
): Promise<StreamEventEnvelope[]> {
  assertRedisEnabled();
  const dbEvents = await dbStreamBusAdapter.publishEvents(params);

  if (options?.onEventsPersisted) {
    try {
      await options.onEventsPersisted(dbEvents);
    } catch (error) {
      if (process.env.NODE_ENV === "production") {
        console.error("[stream-bus] Persisted-events hook failed", {
          chatId: params.chatId,
          runId: params.runId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  const redisWriteUnavailable = isRedisWriteTemporarilyUnavailable();

  if (redisWriteUnavailable) {
    if (redisWriteUnavailable) {
      logRedisUnavailable("redis write cooldown active");
    }
    throw new Error("Redis stream write temporarily unavailable (strict mode)");
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
    return dbEvents;
  } catch (error) {
    markRedisTemporarilyUnavailable();
    if (process.env.NODE_ENV === "production") {
      console.error("[stream-bus] Redis publish failed, switched to cooldown", {
        cooldownMs: REDIS_STREAM_COOLDOWN_MS,
        auth: isRedisAuthError(error),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (isRedisAuthError(error)) {
      logRedisUnavailable("redis auth failed");
    }
    throw error;
  }
}

function assertContiguousEvents(
  events: StreamEventEnvelope[],
  afterLogicalEventId: number
) {
  let expected = Math.max(0, afterLogicalEventId) + 1;
  for (const event of events) {
    if (event.logicalEventId !== expected) {
      throw new Error(
        `Redis stream gap detected (expected ${expected}, got ${event.logicalEventId})`
      );
    }
    expected += 1;
  }
}

export async function readStreamEventsAfter(
  params: ReadEventsAfterParams
): Promise<StreamEventEnvelope[]> {
  assertRedisEnabled();
  const redisTemporarilyUnavailable = isRedisReadTemporarilyUnavailable();
  if (redisTemporarilyUnavailable) {
    if (redisTemporarilyUnavailable) {
      logRedisUnavailable("redis read cooldown active");
    }
    throw new Error("Redis stream read temporarily unavailable (strict mode)");
  }

  try {
    const events = await withTimeout(
      upstashStreamBusAdapter.readEventsAfter(params),
      REDIS_STREAM_READ_TIMEOUT_MS
    );
    if (events.length > 0) {
      assertContiguousEvents(events, params.afterLogicalEventId);
    }
    return events;
  } catch (error) {
    // Enter read cooldown for transient infra failures and auth/config errors.
    if (isRedisTimeoutError(error) || isRedisAuthError(error)) {
      markRedisReadUnavailable();
    }
    if (process.env.NODE_ENV === "production") {
      console.error("[stream-bus] Redis read failed (strict mode)", {
        readCooldownMs: REDIS_STREAM_COOLDOWN_MS,
        timeout: isRedisTimeoutError(error),
        auth: isRedisAuthError(error),
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (isRedisAuthError(error)) {
      logRedisUnavailable("redis auth failed");
    }
    throw error;
  }
}
