import { requireModule } from "@/server/context";
import { PageBody, PageHeader } from "@/components/page-header";
import { EventForm } from "@/components/event-form";

export default async function NewEventPage() {
  const ctx = await requireModule("events");
  return (
    <>
      <PageHeader title={`New ${ctx.config.t("event").toLowerCase()}`} />
      <PageBody><EventForm /></PageBody>
    </>
  );
}
