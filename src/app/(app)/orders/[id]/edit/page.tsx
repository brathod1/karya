import { requireModule } from "@/server/context";
import { getOrder, pickerData } from "@/server/queries";
import { loadCustomFieldValues } from "@/server/domain/fields";
import { db } from "@/server/db";
import { PageBody, PageHeader } from "@/components/page-header";
import { OrderForm } from "@/components/order-form";
import { isoDate } from "@/lib/dates";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireModule("orders");
  const [{ order, items }, { customers, products }, customValues] = await Promise.all([
    getOrder(ctx.org.id, id),
    pickerData(ctx.org.id),
    loadCustomFieldValues(db, ctx.org.id, "ORDER", [id]),
  ]);

  return (
    <>
      <PageHeader title={`Edit ${order.number}`} />
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
          initial={{
            id: order.id,
            customerId: order.customerId,
            orderDate: isoDate(order.orderDate) ?? "",
            deliveryByDate: isoDate(order.deliveryByDate),
            deliveryTime: order.deliveryTime,
            statusId: order.statusId,
            note: order.note,
            internalNote: order.internalNote,
            customerNote: order.customerNote,
            discountType: order.discountType,
            discountValue: order.discountType === "PERCENT" ? order.discountValue : order.discountValue / 100,
            additionalChargesMinor: order.additionalChargesMinor,
            items: items.map((i) => ({
              productId: i.productId, productName: i.productNameSnapshot,
              quantity: i.quantity, unitPriceMinor: i.unitPriceMinor,
              discountMinor: i.discountMinor, note: i.note,
              attributes: (i.attributes as Record<string, unknown> | null) ?? null,
            })),
            customFields: customValues.get(id) ?? {},
          }}
        />
      </PageBody>
    </>
  );
}
