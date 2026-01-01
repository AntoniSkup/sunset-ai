const rateLimitStore = new Map<number, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;

export function checkRateLimit(userId: number): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const userLimit = rateLimitStore.get(userId);

  if (!userLimit || now >= userLimit.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitStore.set(userId, {
      count: 1,
      resetAt,
    });
    return {
      allowed: true,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      resetAt,
    };
  }

  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: userLimit.resetAt,
    };
  }

  userLimit.count += 1;
  rateLimitStore.set(userId, userLimit);

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - userLimit.count,
    resetAt: userLimit.resetAt,
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, limit] of rateLimitStore.entries()) {
    if (now >= limit.resetAt) {
      rateLimitStore.delete(userId);
    }
  }
}, RATE_LIMIT_WINDOW_MS);
