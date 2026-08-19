import { getMemberships, requireOrgContext } from "@/server/context";
import { toClientConfig } from "@/server/domain/config";
import { ConfigProvider } from "@/components/config-provider";
import { ToastProvider } from "@/components/ui/toast";
import { AppShell } from "@/components/app-shell";
import { logoutAction, switchWorkspaceAction } from "@/server/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrgContext();
  const clientConfig = toClientConfig(ctx.config, ctx.role);
  const memberships = await getMemberships(ctx.user.id);

  return (
    <ConfigProvider config={clientConfig}>
      <ToastProvider>
        <AppShell
          user={{ name: ctx.user.name, email: ctx.user.email }}
          onLogout={logoutAction}
          onSwitchWorkspace={switchWorkspaceAction}
          workspaces={memberships.map((m) => ({ id: m.org.id, name: m.org.name, current: m.org.id === ctx.org.id }))}
        >
          {children}
        </AppShell>
      </ToastProvider>
    </ConfigProvider>
  );
}
