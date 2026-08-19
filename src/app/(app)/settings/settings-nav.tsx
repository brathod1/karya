"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const GROUPS: { title: string; items: { href: string; label: string; admin?: boolean }[] }[] = [
  {
    title: "Workspace",
    items: [
      { href: "/settings/business", label: "Business profile" },
      { href: "/settings/users", label: "Users & roles", admin: true },
      { href: "/settings/modules", label: "Modules", admin: true },
    ],
  },
  {
    title: "How it works",
    items: [
      { href: "/settings/terminology", label: "Terminology", admin: true },
      { href: "/settings/statuses", label: "Order statuses", admin: true },
      { href: "/settings/payment-methods", label: "Payment methods", admin: true },
      { href: "/settings/categories", label: "Categories", admin: true },
      { href: "/settings/custom-fields", label: "Custom fields", admin: true },
      { href: "/settings/numbering", label: "Numbering", admin: true },
      { href: "/settings/dashboard", label: "Dashboard widgets", admin: true },
    ],
  },
  {
    title: "Data",
    items: [
      { href: "/import", label: "Import & export" },
      { href: "/settings/audit-log", label: "Audit log", admin: true },
    ],
  },
];

export function SettingsNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-5 lg:sticky lg:top-20 lg:self-start">
      {GROUPS.map((group) => {
        const items = group.items.filter((i) => !i.admin || canManage);
        if (items.length === 0) return null;
        return (
          <div key={group.title}>
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{group.title}</p>
            <div className="flex flex-col gap-0.5">
              {items.map((item) => (
                <Link key={item.href} href={item.href}
                  className={cn("rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
                    pathname === item.href ? "bg-teal-50 font-medium text-brand" : "text-ink-muted hover:bg-stone-100 hover:text-ink")}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
