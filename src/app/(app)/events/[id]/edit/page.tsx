import { requireModule } from "@/server/context";
import { getEvent } from "@/server/queries";
import { PageBody, PageHeader } from "@/components/page-header";
import { EventForm } from "@/components/event-form";
import { isoDate } from "@/lib/dates";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireModule("events");
  const { event } = await getEvent(ctx.org.id, id);

  return (
    <>
      <PageHeader title={`Edit ${event.name}`} />
      <PageBody>
        <EventForm initial={{
          id: event.id, name: event.name,
          startDate: isoDate(event.startDate) ?? "", endDate: isoDate(event.endDate) ?? "",
          location: event.location, notes: event.notes, budgetMinor: event.budgetMinor,
        }} />
      </PageBody>
    </>
  );
}
