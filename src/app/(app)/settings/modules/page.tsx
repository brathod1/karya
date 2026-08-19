import { requireCapability } from "@/server/context";
import { ModulesForm } from "./modules-form";

export default async function ModulesPage() {
  const ctx = await requireCapability("config:manage");
  return <ModulesForm initial={ctx.config.settings.modules} />;
}
