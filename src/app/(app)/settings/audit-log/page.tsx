import { desc, eq } from "drizzle-orm";
import { requireCapability } from "@/server/context";
import { db } from "@/server/db";
import { auditLogs } from "@/server/db/schema";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

export default async function AuditLogPage() {
  const ctx = await requireCapability("audit:view");
  const rows = await db.select().from(auditLogs)
    .where(eq(auditLogs.orgId, ctx.org.id))
    .orderBy(desc(auditLogs.createdAt))
    .limit(200);

  return (
    <Card>
      <CardHeader
        title="Audit log"
        description="Append-only. Nobody, including an owner, can edit or erase these entries from the app."
      />
      <CardBody>
        {rows.length === 0 ? (
          <p className="text-[13px] text-ink-subtle">Nothing recorded yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="py-2.5">
                <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="font-medium">{row.actorName ?? "System"}</span>
                  <span className="text-ink-muted">{row.action}</span>
                  <span className="text-ink-subtle">{row.entityType}</span>
                  <span className="ml-auto tabular text-[11.5px] text-ink-subtle">
                    {formatDateTime(row.createdAt, ctx.config.dateFormat + ", HH:mm")}
                  </span>
                </div>
                {row.before || row.after ? (
                  <p className="mt-0.5 truncate text-[11.5px] text-ink-subtle font-mono">
                    {JSON.stringify(row.before)} → {JSON.stringify(row.after)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
