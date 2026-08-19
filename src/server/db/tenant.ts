import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

/**
 * Tenant scoping.
 *
 * Nothing in this application queries a tenant table without going through
 * `scope()` / `scoped()`. The helpers below make the org filter the *default*
 * rather than something a developer has to remember, which is the only version
 * of tenant isolation that survives contact with a growing codebase.
 */

type WithOrg = PgTable & { orgId: PgColumn };
type WithArchive = { archivedAt: PgColumn };

/** `where` clause scoped to one organisation, plus any extra conditions. */
export function scope<T extends WithOrg>(table: T, orgId: string, ...extra: (SQL | undefined)[]): SQL {
  return and(eq(table.orgId, orgId), ...extra.filter(Boolean)) as SQL;
}

/** Same as `scope`, but also excludes soft-deleted rows. */
export function scoped<T extends WithOrg & WithArchive>(
  table: T, orgId: string, ...extra: (SQL | undefined)[]
): SQL {
  return and(eq(table.orgId, orgId), isNull(table.archivedAt), ...extra.filter(Boolean)) as SQL;
}

/** Values object for inserts, guaranteeing orgId is present and correct. */
export function withOrg<T extends Record<string, unknown>>(orgId: string, values: T): T & { orgId: string } {
  return { ...values, orgId };
}

/**
 * Guard used after a single-row fetch. Returns the row or throws NotFound.
 * We throw NotFound rather than Forbidden on cross-tenant access so that the
 * existence of another organisation's records is never disclosed.
 */
export function mustExist<T>(row: T | undefined | null, what = "Record"): T {
  if (!row) {
    const err = new Error(`${what} not found`) as Error & { status?: number };
    err.status = 404;
    throw err;
  }
  return row;
}
