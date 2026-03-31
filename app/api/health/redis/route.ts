import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getUser } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): Promise<boolean> {
  const internalSecret = request.headers.get("x-internal-job-secret");
  const internalAuthEnabled = Boolean(process.env.INTERNAL_JOB_SECRET);
  const hasInternalAuth =
    internalAuthEnabled && internalSecret === process.env.INTERNAL_JOB_SECRET;
  if (hasInternalAuth) return Promise.resolve(true);
  return getUser().then((user) => Boolean(user));
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const redisUrl =
    process.env.STORAGE_KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL;
  const redisToken =
    process.env.STORAGE_KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN;
  const hasRedisEnv = Boolean(redisUrl && redisToken);
  if (!hasRedisEnv) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "Missing Upstash Redis environment variables",
      },
      { status: 503 }
    );
  }

  const redis =
    redisUrl && redisToken
      ? new Redis({ url: redisUrl, token: redisToken, readYourWrites: true })
      : Redis.fromEnv();
  const pingStartedAt = Date.now();
  const key = `health:redis:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const value = String(pingStartedAt);

  try {
    await redis.set(key, value);
    const roundtrip = await redis.get<string | number | null>(key);
    await redis.del(key);
    const latencyMs = Date.now() - pingStartedAt;

    if (roundtrip == null || String(roundtrip) !== value) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          latencyMs,
          error: "Redis roundtrip value mismatch",
          expected: value,
          received: roundtrip == null ? null : String(roundtrip),
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      latencyMs,
      streamBusEnabled: process.env.ENABLE_REDIS_STREAM_BUS === "1",
      dbFallbackEnabled: process.env.STREAM_BUS_DB_FALLBACK !== "0",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        error:
          error instanceof Error ? error.message : "Redis healthcheck failed",
      },
      { status: 503 }
    );
  }
}
