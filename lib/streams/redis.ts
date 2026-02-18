import { createClient } from "redis";

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connecting: Promise<RedisClient> | null = null;

export async function getRedis(): Promise<RedisClient> {
  if (client) return client;
  if (connecting) return connecting;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set");
  }

  const next = createClient({ url });
  connecting = (async () => {
    next.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("Redis client error:", err);
    });
    await next.connect();
    client = next;
    return next;
  })();

  return connecting;
}

