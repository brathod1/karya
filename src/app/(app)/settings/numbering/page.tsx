import { asc, eq } from "drizzle-orm";
import { requireCapability } from "@/server/context";
import { db } from "@/server/db";
import { numberSequences } from "@/server/db/schema";
import { NumberingEditor } from "./numbering-editor";

export default async function NumberingPage() {
  const ctx = await requireCapability("config:manage");
  const rows = await db.select().from(numberSequences)
    .where(eq(numberSequences.orgId, ctx.org.id)).orderBy(asc(numberSequences.entityType));

  return (
    <NumberingEditor rows={rows.map((r) => ({
      entityType: r.entityType, prefix: r.prefix, pattern: r.pattern,
      nextValue: r.nextValue, resetPolicy: r.resetPolicy,
    }))} />
  );
}
