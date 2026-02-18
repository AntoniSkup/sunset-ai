import { getRedis } from "@/lib/streams/redis";

const KEY_PREFIX = "chat-active-stream:";
const DEFAULT_TTL_SECONDS = 60 * 30; // 30 minutes

function keyForChat(chatId: string): string {
  return `${KEY_PREFIX}${chatId}`;
}

export async function getActiveStreamId(chatId: string): Promise<string | null> {
  const redis = await getRedis();
  const value = await redis.get(keyForChat(chatId));
  return value || null;
}

export async function setActiveStreamId(chatId: string, streamId: string): Promise<void> {
  const redis = await getRedis();
  await redis.set(keyForChat(chatId), streamId, { EX: DEFAULT_TTL_SECONDS });
}

export async function trySetActiveStreamId(chatId: string, streamId: string): Promise<boolean> {
  const redis = await getRedis();
  const res = await redis.set(keyForChat(chatId), streamId, {
    NX: true,
    EX: DEFAULT_TTL_SECONDS,
  });
  return res === "OK";
}

export async function clearActiveStreamId(chatId: string, expectedStreamId?: string): Promise<void> {
  const redis = await getRedis();
  const key = keyForChat(chatId);

  if (!expectedStreamId) {
    await redis.del(key);
    return;
  }

  const current = await redis.get(key);
  if (current === expectedStreamId) {
    await redis.del(key);
  }
}

