"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3, Building2, CalendarRange, Check, ChevronDown, Hammer, LayoutDashboard, LogOut, Menu, Package,
  Plus, Receipt, Settings, ShoppingBag, Upload, Users, Wallet, X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useConfig } from "./config-provider";
import { Button } from "./ui/button";
import type { ModuleKey } from "@/lib/settings";
import type { TermKey } from "@/lib/settings";

type NavItem = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  module?: ModuleKey;
  term?: TermKey;
  label?: string;
};

const NAV: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/orders", icon: ShoppingBag, module: "orders", term: "order" },
  { href: "/orders/to-make", icon: Hammer, module: "orders", label: "To make" },
  { href: "/customers", icon: Users, module: "customers", term: "customer" },
  { href: "/products", icon: Package, module: "products", term: "product" },
  { href: "/events", icon: CalendarRange, module: "events", term: "event" },
  { href: "/expenses", icon: Receipt, module: "expenses", term: "expense" },
  { href: "/payments", icon: Wallet, module: "payments", label: "Payments" },
  { href: "/analytics", icon: BarChart3, module: "analytics", label: "Analytics" },
];

export type WorkspaceSummary = { id: string; name: string; current: boolean };

export function AppShell({ user, onLogout, onSwitchWorkspace, workspaces, children }: {
  user: { name: string; email: string };
  onLogout: () => Promise<void>;
  onSwitchWorkspace: (orgId: string) => Promise<void>;
  workspaces: WorkspaceSummary[];
  children: React.ReactNode;
}) {
  const { modules, t, orgName, logoUrl } = useConfig();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // The sidebar is a pure function of configuration — disabled modules never appear.
  const items = NAV.filter((item) => !item.module || modules[item.module]);
  const label = (item: NavItem) => item.label ?? (item.term ? t(item.term, "many") : "");

  const nav = (
    <nav className="flex flex-col gap-0.5 p-2">
      {items.map((item) => {
        // "/orders" must not light up when the user is on "/orders/to-make".
        const active = item.href === "/orders"
          ? pathname === "/orders" || (pathname.startsWith("/orders/") && !pathname.startsWith("/orders/to-make"))
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href} href={item.href} onClick={() => setMobileOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
              active ? "bg-teal-50 text-brand" : "text-ink-muted hover:bg-stone-100 hover:text-ink",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="truncate">{label(item)}</span>
          </Link>
        );
      })}

      <div className="my-2 h-px bg-line" />

      <Link href="/import" onClick={() => setMobileOpen(false)}
        className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
          pathname.startsWith("/import") ? "bg-teal-50 text-brand" : "text-ink-muted hover:bg-stone-100 hover:text-ink")}>
        <Upload className="size-4 shrink-0" />Import
      </Link>
      <Link href="/settings" onClick={() => setMobileOpen(false)}
        className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
          pathname.startsWith("/settings") ? "bg-teal-50 text-brand" : "text-ink-muted hover:bg-stone-100 hover:text-ink")}>
        <Settings className="size-4 shrink-0" />Settings
      </Link>
    </nav>
  );

  return (
    <div className="min-h-dvh flex bg-bg">
      {/* desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-line bg-white sticky top-0 h-dvh">
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-line">
          {logoUrl
            ? <img src={logoUrl} alt="" className="size-7 rounded-md object-cover" />
            : <div className="grid size-7 place-items-center rounded-md bg-brand text-white text-[12px] font-semibold">
                {orgName.slice(0, 1).toUpperCase()}
              </div>}
          <span className="truncate text-[14px] font-semibold">{orgName}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
        <UserMenu user={user} onLogout={onLogout} onSwitchWorkspace={onSwitchWorkspace}
          workspaces={workspaces} open={menuOpen} setOpen={setMenuOpen} />
      </aside>

      {/* mobile drawer */}
      {mobileOpen ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-stone-900/25" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl animate-sheet">
            <div className="flex items-center justify-between px-4 h-14 border-b border-line">
              <span className="truncate text-[14px] font-semibold">{orgName}</span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="size-4" /></Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
            <UserMenu user={user} onLogout={onLogout} onSwitchWorkspace={onSwitchWorkspace}
              workspaces={workspaces} open={menuOpen} setOpen={setMenuOpen} />
          </div>
        </div>
      ) : null}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 h-14 border-b border-line bg-white/90 backdrop-blur px-3 sm:px-5">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </Button>
          <span className="lg:hidden truncate text-[14px] font-semibold">{orgName}</span>
          <div className="flex-1" />
          <QuickAdd />
        </header>

        <main className="flex-1 min-w-0 pb-20 lg:pb-0">{children}</main>
      </div>

      {/* mobile floating quick add */}
      <div className="lg:hidden fixed bottom-5 right-5 z-40">
        <QuickAdd floating />
      </div>
    </div>
  );
}

function UserMenu({ user, onLogout, onSwitchWorkspace, workspaces, open, setOpen }: {
  user: { name: string; email: string };
  onLogout: () => Promise<void>;
  onSwitchWorkspace: (orgId: string) => Promise<void>;
  workspaces: WorkspaceSummary[];
  open: boolean; setOpen: (v: boolean) => void;
}) {
  return (
    <div className="relative border-t border-line p-2">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-stone-100 text-left">
        <div className="grid size-7 shrink-0 place-items-center rounded-full bg-stone-200 text-[11px] font-semibold text-ink-muted">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{user.name}</p>
          <p className="truncate text-[11.5px] text-ink-subtle">{user.email}</p>
        </div>
        <ChevronDown className="size-3.5 text-ink-subtle" />
      </button>
      {open ? (
        <div className="absolute bottom-full left-2 right-2 mb-1 rounded-lg bg-white p-1 shadow-lg ring-1 ring-line animate-in">
          {workspaces.length > 1 ? (
            <>
              <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                Workspaces
              </p>
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id} type="button"
                  onClick={async () => {
                    setOpen(false);
                    if (!workspace.current) await onSwitchWorkspace(workspace.id);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] hover:bg-stone-100"
                >
                  <Check className={cn("size-3.5 shrink-0", workspace.current ? "text-brand" : "opacity-0")} />
                  <span className="truncate">{workspace.name}</span>
                </button>
              ))}
              <div className="my-1 h-px bg-line" />
            </>
          ) : null}

          <Link href="/onboarding" onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] hover:bg-stone-100">
            <Building2 className="size-3.5" />Add another business
          </Link>

          <Link href="/settings/business" onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] hover:bg-stone-100">
            <Settings className="size-3.5" />Workspace settings
          </Link>
          <form action={onLogout}>
            <button type="submit" className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-red-700 hover:bg-red-50">
              <LogOut className="size-3.5" />Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function QuickAdd({ floating }: { floating?: boolean }) {
  const { modules, t } = useConfig();
  const [open, setOpen] = useState(false);

  const actions = [
    { href: "/orders/new", label: `New ${t("order").toLowerCase()}`, module: "orders" as const, icon: ShoppingBag },
    { href: "/customers/new", label: `New ${t("customer").toLowerCase()}`, module: "customers" as const, icon: Users },
    { href: "/products/new", label: `New ${t("product").toLowerCase()}`, module: "products" as const, icon: Package },
    { href: "/expenses/new", label: `Add ${t("expense").toLowerCase()}`, module: "expenses" as const, icon: Receipt },
    { href: "/events/new", label: `New ${t("event").toLowerCase()}`, module: "events" as const, icon: CalendarRange },
  ].filter((a) => modules[a.module]);

  if (actions.length === 0) return null;

  return (
    <div className="relative">
      {floating ? (
        <button onClick={() => setOpen((v) => !v)} aria-label="Quick add"
          className="grid size-14 place-items-center rounded-full bg-brand text-white shadow-lg active:scale-95 transition">
          <Plus className={cn("size-6 transition-transform", open && "rotate-45")} />
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen((v) => !v)}><Plus className="size-4" />New</Button>
      )}

      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className={cn(
            "absolute z-50 w-56 rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-line animate-in",
            floating ? "bottom-16 right-0" : "right-0 top-full mt-1",
          )}>
            {actions.map((a) => (
              <Link key={a.href} href={a.href} onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] hover:bg-stone-100">
                <a.icon className="size-4 text-ink-subtle" />{a.label}
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
