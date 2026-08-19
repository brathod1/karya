import { requireCapability } from "@/server/context";
import { TerminologyForm } from "./terminology-form";

export default async function TerminologyPage() {
  const ctx = await requireCapability("config:manage");
  return <TerminologyForm initial={ctx.config.settings.terminology} />;
}
