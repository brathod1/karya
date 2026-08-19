import { requireCapability } from "@/server/context";
import { DashboardSettings } from "./dashboard-settings";

export default async function DashboardSettingsPage() {
  const ctx = await requireCapability("config:manage");
  return <DashboardSettings initial={ctx.config.settings.dashboard.widgets} modules={ctx.config.settings.modules} />;
}
