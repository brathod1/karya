import { requireModule } from "@/server/context";
import { PageBody, PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";

export default async function NewProductPage() {
  const ctx = await requireModule("products");
  return (
    <>
      <PageHeader title={`New ${ctx.config.t("product").toLowerCase()}`} />
      <PageBody>
        <ProductForm
          categories={ctx.config.productCategories.map((c) => ({ id: c.id, name: c.name }))}
          fieldDefs={ctx.config.fieldDefs.filter((f) => f.entityType === "PRODUCT" && f.isActive).map((f) => ({
            id: f.id, key: f.key, label: f.label, type: f.type, helpText: f.helpText,
            isRequired: f.isRequired, options: f.options as { value: string; label: string }[] | null,
          }))}
        />
      </PageBody>
    </>
  );
}
