import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/server/env";
import * as schema from "./schema";
import { normaliseConnectionString } from "./connection-string";
import { profilingEnabled, recordQuery } from "./instrument";

declare global {
  // eslint-disable-next-line no-var
  var __karyaPool: Pool | undefined;
}

function makePool() {
  return new Pool({
    connectionString: normaliseConnectionString(env().DATABASE_URL),
    max: 10,
    idleTimeoutMillis: 30_000,
  });
}

const pool = globalThis.__karyaPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalThis.__karyaPool = pool;

/**
 * Times every statement so `profile()` can report per-request totals.
 * Wrapping the pool rather than the ORM means nothing can slip past it.
 */
if (profilingEnabled() && !(pool as { __karyaInstrumented?: boolean }).__karyaInstrumented) {
  (pool as { __karyaInstrumented?: boolean }).__karyaInstrumented = true;
  const original = pool.query.bind(pool);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = (...args: unknown[]) => {
    const started = performance.now();
    const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string })?.text ?? "";
    const result = (original as (...a: unknown[]) => unknown)(...args);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).finally(() => recordQuery(text, performance.now() - started));
    }
    return result;
  };
}

export const db = drizzle(pool, { schema });
export type Db = typeof db;
/** A transaction handle, structurally usable anywhere `db` is. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either the pooled client or an open transaction — every domain function accepts this. */
export type Exec = Db | Tx;

export { schema };
