import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireModule } from "@/server/context";
import { db } from "@/server/db";
import { expenses } from "@/server/db/schema";
import { loadCustomFieldValues } from "@/server/domain/fields";
import { PageBody, PageHeader } from "@/components/page-header";
import { ExpenseForm } from "@/components/expense-form";
import { isoDate } from "@/lib/dates";
import { RecordActions } from "@/components/record-actions";

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireModule("expenses");
  const [expense] = await db.select().from(expenses).where(and(eq(expenses.orgId, ctx.org.id), eq(expenses.id, id))).limit(1);
  if (!expense) notFound();
  const values = (await loadCustomFieldValues(db, ctx.org.id, "EXPENSE", [id])).get(id) ?? {};

  return (
    <>
      <PageHeader
        title={`Edit ${ctx.config.t("expense").toLowerCase()}`}
        description={expense.code}
        actions={
          <RecordActions
            kind="EXPENSE" id={expense.id} label={expense.description}
            archived={!!expense.archivedAt} returnTo="/expenses"
            noun={ctx.config.t("expense").toLowerCase()}
          />
        }
      />
      <PageBody>
        <ExpenseForm
          categories={ctx.config.expenseCategories.map((c) => ({ id: c.id, name: c.name }))}
          methods={ctx.config.paymentMethods.filter((m) => m.isActive).map((m) => ({ id: m.id, label: m.label }))}
          fieldDefs={ctx.config.fieldDefs.filter((f) => f.entityType === "EXPENSE" && f.isActive).map((f) => ({
            id: f.id, key: f.key, label: f.label, type: f.type, helpText: f.helpText,
            isRequired: f.isRequired, options: f.options as { value: string; label: string }[] | null,
          }))}
          initial={{
            id: expense.id, date: isoDate(expense.date) ?? "", description: expense.description,
            categoryId: expense.categoryId, amountMinor: expense.amountMinor, methodId: expense.methodId,
            vendor: expense.vendor, notes: expense.notes, customFields: values,
          }}
        />
      </PageBody>
    </>
  );
}
