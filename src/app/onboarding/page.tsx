import { redirect } from "next/navigation";
import { getCurrentUser, getMemberships } from "@/server/context";
import { TEMPLATE_LIST } from "@/server/domain/templates";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const existing = await getMemberships(user.id);
  const isFirst = existing.length === 0;

  const templates = TEMPLATE_LIST.map((t) => ({
    key: t.key,
    label: t.label,
    description: t.description,
    statuses: t.statuses.map((s) => s.label),
    modules: Object.entries(t.settings.modules ?? {}).filter(([, on]) => on).map(([k]) => k),
    expenseCategories: t.expenseCategories,
  }));

  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-2xl px-5 py-12">
        <p className="text-[13px] font-medium text-brand">Karya</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {isFirst ? "Set up your business" : "Add another business"}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          Three questions. Everything you pick here can be changed later in Settings.
          {isFirst ? null : " This creates a completely separate workspace — its own orders, customers and settings."}
        </p>
        {isFirst ? null : (
          <a href="/dashboard" className="mt-3 inline-block text-[13px] font-medium text-brand hover:underline">
            ← Back to {existing[0]?.org.name}
          </a>
        )}
        <div className="mt-8"><OnboardingForm templates={templates} /></div>
      </div>
    </main>
  );
}
