import { requireCapability } from "@/server/context";
import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { importJobs } from "@/server/db/schema";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ImportWizard } from "./import-wizard";
import { formatDateTime } from "@/lib/format";

export default async function ImportPage() {
  const ctx = await requireCapability("import:run");
  const history = await db.select().from(importJobs)
    .where(eq(importJobs.orgId, ctx.org.id)).orderBy(desc(importJobs.createdAt)).limit(10);

  return (
    <>
      <PageHeader
        title="Import & export"
        description="Bring your existing spreadsheet in. Export anything back out whenever you like."
      />
      <PageBody className="space-y-4">
        <ImportWizard
          terms={{
            order: ctx.config.t("order", "many"), customer: ctx.config.t("customer", "many"),
            product: ctx.config.t("product", "many"), expense: ctx.config.t("expense", "many"),
          }}
        />

        {history.length > 0 ? (
          <Card>
            <CardHeader title="Import history" />
            <CardBody>
              <ul className="divide-y divide-line">
                {history.map((job) => (
                  <li key={job.id} className="flex flex-wrap items-baseline gap-x-3 py-2.5 text-[13px]">
                    <span className="font-medium">{job.fileName}</span>
                    <span className="text-ink-muted">{job.targetEntity}</span>
                    <span className="text-emerald-700">{job.successRows} imported</span>
                    {job.errorRows > 0 ? <span className="text-red-700">{job.errorRows} skipped</span> : null}
                    <span className="ml-auto tabular text-[11.5px] text-ink-subtle">
                      {formatDateTime(job.createdAt, ctx.config.dateFormat + ", HH:mm")}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}
      </PageBody>
    </>
  );
}
