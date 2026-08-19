import { requireOrgContext } from "@/server/context";
import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrgContext();
  return (
    <div className="px-4 sm:px-6 py-6">
      <h1 className="text-[22px] font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-[13.5px] text-ink-muted">
        Everything here is configuration. Nothing requires a developer.
      </p>
      <div className="mt-5 grid gap-6 lg:grid-cols-[220px_1fr]">
        <SettingsNav canManage={ctx.role === "OWNER" || ctx.role === "ADMIN"} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
