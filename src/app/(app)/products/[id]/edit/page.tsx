import { requireModule } from "@/server/context";
import { getProduct } from "@/server/queries";
import { loadCustomFieldValues } from "@/server/domain/fields";
import { db } from "@/server/db";
import { PageBody, PageHeader } from "@/components/page-header";
import { ProductForm } from "@/components/product-form";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireModule("products");
  const { product } = await getProduct(ctx.org.id, id);
  const values = (await loadCustomFieldValues(db, ctx.org.id, "PRODUCT", [id])).get(id) ?? {};

  return (
    <>
      <PageHeader title={`Edit ${product.name}`} />
      <PageBody>
        <ProductForm
          categories={ctx.config.productCategories.map((c) => ({ id: c.id, name: c.name }))}
          fieldDefs={ctx.config.fieldDefs.filter((f) => f.entityType === "PRODUCT" && f.isActive).map((f) => ({
            id: f.id, key: f.key, label: f.label, type: f.type, helpText: f.helpText,
            isRequired: f.isRequired, options: f.options as { value: string; label: string }[] | null,
          }))}
          initial={{
            id: product.id, name: product.name, description: product.description,
            categoryId: product.categoryId, defaultPriceMinor: product.defaultPriceMinor,
            costMinor: product.costMinor, unit: product.unit, notes: product.notes,
            isActive: product.isActive, customFields: values,
          }}
        />
      </PageBody>
    </>
  );
}
