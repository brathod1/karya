import { existsSync } from "node:fs";
import { vi } from "vitest";

/**
 * Runs before any integration test module is imported, so the connection pool
 * sees this environment when it is created.
 */

// Attachments go into Postgres, so they are removed with the test workspaces
// instead of being left on disk. Set before `.env` loads, which never overrides.
process.env.STORAGE_DRIVER = "database";
if (existsSync(".env")) process.loadEnvFile(".env");
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * These tests create and delete workspaces. They must never touch real client
 * data. The production branch endpoint is named here so a copied connection
 * string cannot slip through.
 */
const PRODUCTION_ENDPOINTS = ["ep-round-smoke"];
const url = process.env.DATABASE_URL ?? "";
if (!url) {
  throw new Error("Integration tests need DATABASE_URL (or TEST_DATABASE_URL) pointing at a development database.");
}
if (PRODUCTION_ENDPOINTS.some((endpoint) => url.includes(endpoint)) || process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run integration tests against the production database.");
}

/**
 * Next's request APIs only exist inside a request. The session code reads and
 * writes a cookie, so a small in-memory jar stands in for the browser; tests
 * sign in by putting a genuinely signed session token into it.
 */
vi.mock("next/headers", () => {
  const holder = globalThis as { __karyaTestCookies?: Map<string, string> };
  const jar = (holder.__karyaTestCookies ??= new Map<string, string>());
  return {
    cookies: async () => ({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      set: (name: string, value: string) => { jar.set(name, value); },
      delete: (name: string) => { jar.delete(name); },
    }),
    headers: async () => new Headers({ "x-forwarded-for": "203.0.113.10" }),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));
