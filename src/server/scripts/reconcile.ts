/**
 * Nightly consistency check.
 *
 * `orders.paid_minor` is a cache of `sum(payments)` kept for indexable filtering.
 * A cache is only trustworthy if something checks it, so this script recomputes
 * every order's paid total from its payment rows and corrects any divergence.
 *
 *   npm run db:reconcile
 *
 * Exits non-zero if anything had to be corrected, so a cron job can alert on it.
 */
import { eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { orders } from "@/server/db/schema";
import { reconcileOrderPayments } from "@/server/domain/orders";

async function main() {
  const rows = await db
    .select({ id: orders.id, orgId: orders.orgId, number: orders.number })
    .from(orders)
    .where(isNull(orders.archivedAt));

  let corrected = 0;
  for (const row of rows) {
    const result = await reconcileOrderPayments(row.orgId, row.id);
    if (result.corrected) {
      corrected++;
      console.warn(`corrected ${row.number}: paid is ${result.paidMinor} minor units`);
    }
  }

  console.log(`Checked ${rows.length} orders. ${corrected} corrected.`);
  process.exit(corrected === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
