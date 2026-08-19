import { requireModule } from "@/server/context";
import { PageBody, PageHeader } from "@/components/page-header";
import { CustomerForm } from "@/components/customer-form";

export default async function NewCustomerPage() {
  const ctx = await requireModule("customers");
  return (
    <>
      <PageHeader title={`New ${ctx.config.t("customer").toLowerCase()}`} />
      <PageBody>
        <CustomerForm fieldDefs={ctx.config.fieldDefs.filter((f) => f.entityType === "CUSTOMER" && f.isActive).map((f) => ({
          id: f.id, key: f.key, label: f.label, type: f.type, helpText: f.helpText,
          isRequired: f.isRequired, options: f.options as { value: string; label: string }[] | null,
        }))} />
      </PageBody>
    </>
  );
}
