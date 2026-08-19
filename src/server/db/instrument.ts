import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Per-request query accounting.
 *
 * Turned on by KARYA_PROFILE=1, or automatically in development. It exists so
 * that "the dashboard feels slow" can be answered with a number rather than an
 * opinion — how many statements, how long in the database, and which one hurt.
 */
export type QueryStats = {
  label: string;
  count: number;
  dbMs: number;
  slowest: { sql: string; ms: number } | null;
};

export const queryStats = new AsyncLocalStorage<QueryStats>();

export function profilingEnabled() {
  return process.env.KARYA_PROFILE === "1" || process.env.NODE_ENV === "development";
}

export function recordQuery(sql: string, ms: number) {
  const store = queryStats.getStore();
  if (!store) return;
  store.count += 1;
  store.dbMs += ms;
  if (!store.slowest || ms > store.slowest.ms) {
    store.slowest = { sql: sql.replace(/\s+/g, " ").slice(0, 120), ms };
  }
}

/**
 * Wraps a page or action so its database use is reported when it finishes.
 *
 *   Dashboard  18 queries  412ms db  1180ms total
 *     slowest 96ms  select count(*) filter (where …) from orders …
 */
export async function profile<T>(label: string, run: () => Promise<T>): Promise<T> {
  if (!profilingEnabled()) return run();

  const store: QueryStats = { label, count: 0, dbMs: 0, slowest: null };
  const started = Date.now();

  return queryStats.run(store, async () => {
    try {
      return await run();
    } finally {
      const total = Date.now() - started;
      const slowest = store.slowest
        ? `\n    slowest ${Math.round(store.slowest.ms)}ms  ${store.slowest.sql}`
        : "";
      console.log(
        `[perf] ${label.padEnd(12)} ${String(store.count).padStart(3)} queries  ` +
        `${String(Math.round(store.dbMs)).padStart(5)}ms db  ${String(total).padStart(5)}ms total${slowest}`,
      );
    }
  });
}
