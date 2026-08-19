import { requireCapability } from "@/server/context";
import { StatusesEditor } from "./statuses-editor";

export default async function StatusesPage() {
  const ctx = await requireCapability("config:manage");
  return (
    <StatusesEditor
      statuses={ctx.config.orderStatuses.map((s) => ({
        id: s.id, key: s.key, label: s.label, color: s.color, sortOrder: s.sortOrder,
        isDefault: s.isDefault, isCompleted: s.isCompleted, semantic: s.semantic, isActive: s.isActive,
      }))}
      orderTerm={ctx.config.t("order")}
    />
  );
}
