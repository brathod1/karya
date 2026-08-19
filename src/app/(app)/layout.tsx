import { requireOrgContext } from "@/server/context";
import { profile } from "@/server/db/instrument";
import { toClientConfig } from "@/server/domain/config";
import { ConfigProvider } from "@/components/config-provider";
import { ToastProvider } from "@/components/ui/toast";
import { AppShell } from "@/components/app-shell";
import { logoutAction, switchWorkspaceAction } from "@/server/actions/auth";

async function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrgContext();
  const clientConfig = toClientConfig(ctx.config, ctx.role);

  return (
    <ConfigProvider config={clientConfig}>
      <ToastProvider>
        <AppShell
          user={{ name: ctx.user.name, email: ctx.user.email }}
          onLogout={logoutAction}
          onSwitchWorkspace={switchWorkspaceAction}
          workspaces={ctx.workspaces}
        >
          {children}
        </AppShell>
      </ToastProvider>
    </ConfigProvider>
  );
}

/** Auth and configuration happen here, so they are reported separately. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  return profile("Layout(auth)", () => AppLayoutInner({ children }));
}
