/**
 * Pure sliding-window logic, kept separate from storage so it can be tested
 * without a database.
 */
export type RateLimitRule = { limit: number; windowMs: number };

export type RateLimitVerdict = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Given the timestamps of previous attempts, decides whether one more is allowed.
 *
 * `retryAfterSeconds` is measured from the oldest attempt still inside the
 * window, so the caller is told exactly how long the door stays shut rather
 * than being made to guess.
 */
export function evaluateRateLimit(
  attempts: Date[], rule: RateLimitRule, now: Date = new Date(),
): RateLimitVerdict {
  const cutoff = now.getTime() - rule.windowMs;
  const recent = attempts
    .map((d) => d.getTime())
    .filter((t) => t > cutoff)
    .sort((a, b) => a - b);

  if (recent.length < rule.limit) {
    return { allowed: true, remaining: rule.limit - recent.length - 1, retryAfterSeconds: 0 };
  }

  const oldest = recent[0];
  const retryAfterMs = Math.max(oldest + rule.windowMs - now.getTime(), 0);
  return { allowed: false, remaining: 0, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
}

export function describeWait(seconds: number): string {
  if (seconds <= 60) return "a minute";
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "a minute" : `${minutes} minutes`;
}

/**
 * Per-email limits are tighter than per-IP, because a household or an office
 * shares one address and must not lock each other out.
 */
export const AUTH_LIMITS = {
  perEmail: { limit: 5, windowMs: 15 * 60 * 1000 },
  perIp: { limit: 30, windowMs: 15 * 60 * 1000 },
  registerPerIp: { limit: 10, windowMs: 60 * 60 * 1000 },
} satisfies Record<string, RateLimitRule>;
