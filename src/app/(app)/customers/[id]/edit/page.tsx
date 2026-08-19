import { requireModule } from "@/server/context";
import { getCustomer } from "@/server/queries";
import { loadCustomFieldValues } from "@/server/domain/fields";
import { db } from "@/server/db";
import { PageBody, PageHeader } from "@/components/page-header";
import { CustomerForm } from "@/components/customer-form";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireModule("customers");
  const { customer } = await getCustomer(ctx.org.id, id);
  const values = (await loadCustomFieldValues(db, ctx.org.id, "CUSTOMER", [id])).get(id) ?? {};

  return (
    <>
      <PageHeader title={`Edit ${customer.name}`} />
      <PageBody>
        <CustomerForm
          fieldDefs={ctx.config.fieldDefs.filter((f) => f.entityType === "CUSTOMER" && f.isActive).map((f) => ({
            id: f.id, key: f.key, label: f.label, type: f.type, helpText: f.helpText,
            isRequired: f.isRequired, options: f.options as { value: string; label: string }[] | null,
          }))}
          initial={{
            id: customer.id, name: customer.name, phone: customer.phone, email: customer.email,
            address: customer.address, notes: customer.notes, tags: customer.tags, customFields: values,
          }}
        />
      </PageBody>
    </>
  );
}
