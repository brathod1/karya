import { requireCapability } from "@/server/context";
import { CustomFieldsEditor } from "./custom-fields-editor";

export default async function CustomFieldsPage() {
  const ctx = await requireCapability("config:manage");
  return (
    <CustomFieldsEditor
      terms={{
        ORDER: ctx.config.t("order"), ORDER_ITEM: `${ctx.config.t("order")} line`,
        CUSTOMER: ctx.config.t("customer"),
        PRODUCT: ctx.config.t("product"), EXPENSE: ctx.config.t("expense"), EVENT: ctx.config.t("event"),
      }}
      fields={ctx.config.fieldDefs.map((f) => ({
        id: f.id, entityType: f.entityType, key: f.key, label: f.label, type: f.type,
        helpText: f.helpText, isRequired: f.isRequired, isActive: f.isActive, showInTable: f.showInTable,
        options: (f.options as { value: string; label: string }[] | null) ?? [],
      }))}
    />
  );
}
