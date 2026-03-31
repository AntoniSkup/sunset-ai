import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "app",
    redisConfigured: Boolean(
      (process.env.STORAGE_KV_REST_API_URL &&
        process.env.STORAGE_KV_REST_API_TOKEN) ||
        (process.env.UPSTASH_REDIS_REST_URL &&
          process.env.UPSTASH_REDIS_REST_TOKEN) ||
        (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
    ),
    streamBusEnabled: process.env.ENABLE_REDIS_STREAM_BUS === "1",
    dbFallbackEnabled: process.env.STREAM_BUS_DB_FALLBACK !== "0",
  });
}
