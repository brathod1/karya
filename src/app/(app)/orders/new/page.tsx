import { requireModule } from "@/server/context";
import { pickerData } from "@/server/queries";
import { PageBody, PageHeader } from "@/components/page-header";
import { OrderForm } from "@/components/order-form";

export default async function NewOrderPage() {
  const ctx = await requireModule("orders");
  const { customers, products } = await pickerData(ctx.org.id);

  return (
    <>
      <PageHeader title={`New ${ctx.config.t("order").toLowerCase()}`} description="Totals update as you type." />
      <PageBody>
        <OrderForm
          customers={customers}
          products={products}
          statuses={ctx.config.orderStatuses.map((s) => ({ id: s.id, label: s.label, isActive: s.isActive, isDefault: s.isDefault }))}
          methods={ctx.config.paymentMethods.filter((m) => m.isActive).map((m) => ({ id: m.id, label: m.label }))}
          fieldDefs={ctx.config.fieldDefs.filter((f) => f.entityType === "ORDER" && f.isActive).map((f) => ({
            id: f.id, key: f.key, label: f.label, type: f.type, helpText: f.helpText,
            isRequired: f.isRequired, options: f.options as { value: string; label: string }[] | null,
          }))}
          lineFieldDefs={ctx.config.fieldDefs.filter((f) => f.entityType === "ORDER_ITEM" && f.isActive).map((f) => ({
            id: f.id, key: f.key, label: f.label, type: f.type, helpText: f.helpText,
            isRequired: f.isRequired, options: f.options as { value: string; label: string }[] | null,
          }))}
        />
      </PageBody>
    </>
  );
}
