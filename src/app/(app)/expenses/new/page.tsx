import { requireModule } from "@/server/context";
import { PageBody, PageHeader } from "@/components/page-header";
import { ExpenseForm } from "@/components/expense-form";

export default async function NewExpensePage() {
  const ctx = await requireModule("expenses");
  return (
    <>
      <PageHeader title={`Add ${ctx.config.t("expense").toLowerCase()}`} />
      <PageBody>
        <ExpenseForm
          categories={ctx.config.expenseCategories.map((c) => ({ id: c.id, name: c.name }))}
          methods={ctx.config.paymentMethods.filter((m) => m.isActive).map((m) => ({ id: m.id, label: m.label }))}
          fieldDefs={ctx.config.fieldDefs.filter((f) => f.entityType === "EXPENSE" && f.isActive).map((f) => ({
            id: f.id, key: f.key, label: f.label, type: f.type, helpText: f.helpText,
            isRequired: f.isRequired, options: f.options as { value: string; label: string }[] | null,
          }))}
        />
      </PageBody>
    </>
  );
}
