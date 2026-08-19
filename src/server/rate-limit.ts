import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/server/db";
import { authAttempts } from "@/server/db/schema";
import { AUTH_LIMITS, describeWait, evaluateRateLimit, type RateLimitRule } from "@/lib/rate-limit";

export { AUTH_LIMITS, describeWait };

/** Best-effort client address; falls back to a constant so the limit still applies. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? h.get("cf-connecting-ip") ?? "unknown";
}

export async function checkRateLimit(scope: string, key: string, rule: RateLimitRule) {
  const since = new Date(Date.now() - rule.windowMs);
  const rows = await db
    .select({ createdAt: authAttempts.createdAt })
    .from(authAttempts)
    .where(and(eq(authAttempts.scope, scope), eq(authAttempts.key, key.toLowerCase()), gt(authAttempts.createdAt, since)));

  return evaluateRateLimit(rows.map((r) => r.createdAt), rule);
}

export async function recordAttempt(scope: string, key: string) {
  await db.insert(authAttempts).values({ scope, key: key.toLowerCase() });

  // Opportunistic cleanup: cheap, and keeps the table from growing forever
  // without needing a scheduled job.
  if (Math.random() < 0.02) {
    await db.delete(authAttempts).where(lt(authAttempts.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)));
  }
}

export async function clearAttempts(scope: string, key: string) {
  await db.delete(authAttempts).where(and(eq(authAttempts.scope, scope), eq(authAttempts.key, key.toLowerCase())));
}

/** Runs both the per-email and per-IP checks and returns a ready-made message. */
export async function guardAuthAttempt(email: string, ip: string, rules: { email?: RateLimitRule; ip: RateLimitRule }) {
  if (rules.email) {
    const byEmail = await checkRateLimit("email", email, rules.email);
    if (!byEmail.allowed) {
      return { blocked: true as const, message: `Too many attempts for that email. Try again in ${describeWait(byEmail.retryAfterSeconds)}.` };
    }
  }
  const byIp = await checkRateLimit("ip", ip, rules.ip);
  if (!byIp.allowed) {
    return { blocked: true as const, message: `Too many attempts from this device. Try again in ${describeWait(byIp.retryAfterSeconds)}.` };
  }
  return { blocked: false as const };
}
