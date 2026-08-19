import { describe, expect, it } from "vitest";
import { AUTH_LIMITS, describeWait, evaluateRateLimit } from "./rate-limit";

const now = new Date("2026-08-18T12:00:00Z");
const minutesAgo = (n: number) => new Date(now.getTime() - n * 60_000);

describe("login throttling", () => {
  const rule = { limit: 5, windowMs: 15 * 60 * 1000 };

  it("allows attempts up to the limit", () => {
    const attempts = [minutesAgo(1), minutesAgo(2), minutesAgo(3), minutesAgo(4)];
    expect(evaluateRateLimit(attempts, rule, now)).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("blocks the attempt that exceeds the limit", () => {
    const attempts = [minutesAgo(1), minutesAgo(2), minutesAgo(3), minutesAgo(4), minutesAgo(5)];
    expect(evaluateRateLimit(attempts, rule, now).allowed).toBe(false);
  });

  it("ignores attempts that have aged out of the window", () => {
    const attempts = [minutesAgo(20), minutesAgo(30), minutesAgo(45), minutesAgo(60), minutesAgo(90)];
    expect(evaluateRateLimit(attempts, rule, now).allowed).toBe(true);
  });

  it("tells the caller exactly how long to wait, counted from the oldest attempt", () => {
    // Oldest is 5 minutes old, so 10 of the 15-minute window remain.
    const attempts = [minutesAgo(5), minutesAgo(4), minutesAgo(3), minutesAgo(2), minutesAgo(1)];
    const verdict = evaluateRateLimit(attempts, rule, now);
    expect(verdict.allowed).toBe(false);
    expect(verdict.retryAfterSeconds).toBe(10 * 60);
  });

  it("re-opens once the oldest attempt expires", () => {
    const attempts = [minutesAgo(16), minutesAgo(4), minutesAgo(3), minutesAgo(2), minutesAgo(1)];
    expect(evaluateRateLimit(attempts, rule, now).allowed).toBe(true);
  });

  it("starts from nothing", () => {
    expect(evaluateRateLimit([], rule, now)).toMatchObject({ allowed: true, remaining: 4 });
  });

  it("is stricter per email than per device, so a shared office IP is usable", () => {
    expect(AUTH_LIMITS.perEmail.limit).toBeLessThan(AUTH_LIMITS.perIp.limit);
  });

  it("describes the wait in words a person would use", () => {
    expect(describeWait(30)).toBe("a minute");
    expect(describeWait(60)).toBe("a minute");
    expect(describeWait(600)).toBe("10 minutes");
  });
});
