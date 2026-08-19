import { requireCapability } from "@/server/context";
import { SimpleListEditor } from "../simple-list-editor";

export default async function PaymentMethodsPage() {
  const ctx = await requireCapability("config:manage");
  return (
    <SimpleListEditor
      kind="method"
      title="Payment methods"
      description="How money reaches you. Add only what you actually use."
      rows={ctx.config.paymentMethods.map((m) => ({ id: m.id, name: m.label, isActive: m.isActive }))}
    />
  );
}
