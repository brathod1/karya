import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { env } from "@/server/env";
import * as schema from "./schema";
import { normaliseConnectionString } from "./connection-string";
import { profilingEnabled, recordQuery } from "./instrument";

declare global {
  // eslint-disable-next-line no-var
  var __karyaPool: Pool | undefined;
}

/**
 * Pool sizing, tuned for a distant database.
 *
 * The instinct is to allow many connections so parallel queries never queue.
 * Against Neon in Singapore that is backwards: each *new* connection costs a
 * TLS handshake plus SCRAM authentication — several round trips — while a query
 * on an already-open connection costs one. A dashboard firing thirteen queries
 * at a cold pool of ten opened ten connections and paid the handshake ten
 * times; queueing those same queries over a few warm connections is faster.
 *
 * `idleTimeout` is long enough that connections survive between page loads
 * instead of being rebuilt on every navigation, which is what makes a larger
 * `max` safe: the handshake cost is paid once, then amortised. Measured warm,
 * a dashboard of 13 queries goes from three waves to two.
 */
function makePool() {
  return new Pool({
    connectionString: normaliseConnectionString(env().DATABASE_URL),
    max: 8,
    idleTimeoutMillis: 5 * 60_000,
    keepAlive: true,
    connectionTimeoutMillis: 15_000,
  });
}

const pool = globalThis.__karyaPool ?? makePool();
if (process.env.NODE_ENV !== "production") globalThis.__karyaPool = pool;

/**
 * Times every statement so `profile()` can report per-request totals.
 *
 * A Proxy rather than patching the instance: drizzle uses `pool.query` for
 * ordinary statements but `pool.connect()` for transactions, and a client
 * obtained that way would otherwise go uncounted. Wrapping both paths means
 * nothing slips past.
 */
function instrument(target: Pool): Pool {
  if (!profilingEnabled()) return target;

  const timed = (fn: (...a: never[]) => unknown, self: unknown) => (...args: unknown[]) => {
    const started = performance.now();
    const text = typeof args[0] === "string" ? args[0] : (args[0] as { text?: string })?.text ?? "";
    const result = (fn as (...a: unknown[]) => unknown).apply(self, args);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      return (result as Promise<unknown>).finally(() => recordQuery(text, performance.now() - started));
    }
    recordQuery(text, performance.now() - started);
    return result;
  };

  return new Proxy(target, {
    get(pool, prop, receiver) {
      if (prop === "query") return timed(pool.query as never, pool);
      if (prop === "connect") {
        return async (...args: unknown[]) => {
          const connect = pool.connect as unknown as (...a: unknown[]) => Promise<PoolClient>;
          const client = await connect(...args);
          const original = client.query as unknown as (...a: never[]) => unknown;
          (client as unknown as { query: unknown }).query = timed(original, client);
          return client;
        };
      }
      const value = Reflect.get(pool, prop, receiver);
      return typeof value === "function" ? value.bind(pool) : value;
    },
  }) as Pool;
}

export const db = drizzle(instrument(pool), { schema });
export type Db = typeof db;
/** A transaction handle, structurally usable anywhere `db` is. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Either the pooled client or an open transaction — every domain function accepts this. */
export type Exec = Db | Tx;

export { schema };
