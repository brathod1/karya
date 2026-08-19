import { requireCapability } from "@/server/context";
import { SimpleListEditor } from "../simple-list-editor";

export default async function CategoriesPage() {
  const ctx = await requireCapability("config:manage");
  return (
    <div className="space-y-4">
      <SimpleListEditor
        kind="PRODUCT"
        title={`${ctx.config.t("product")} categories`}
        description={`Group your ${ctx.config.t("product", "many").toLowerCase()} however makes sense to you.`}
        rows={ctx.config.productCategories.map((c) => ({ id: c.id, name: c.name, isActive: true, parentId: c.parentId }))}
        parents={ctx.config.productCategories.map((c) => ({ id: c.id, name: c.name }))}
      />
      <SimpleListEditor
        kind="EXPENSE"
        title={`${ctx.config.t("expense")} categories`}
        description="Used for the expense breakdown on your dashboard and analytics."
        rows={ctx.config.expenseCategories.map((c) => ({ id: c.id, name: c.name, isActive: true, parentId: c.parentId }))}
        parents={ctx.config.expenseCategories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
