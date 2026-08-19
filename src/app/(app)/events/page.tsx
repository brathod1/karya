import Link from "next/link";
import { CalendarRange, Plus } from "lucide-react";
import { requireModule } from "@/server/context";
import { listEvents } from "@/server/queries";
import { computeEventProgress } from "@/server/domain/events";
import { PageBody, PageHeader } from "@/components/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty";
import { ProgressRing } from "@/components/progress";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

export default async function EventsPage() {
  const ctx = await requireModule("events");
  const rows = await listEvents(ctx.org.id);
  const threshold = ctx.config.settings.events.completeThresholdPct;

  return (
    <>
      <PageHeader
        title={ctx.config.t("event", "many")}
        description="Plan what to make, and track how much of it is done."
        actions={
          <Link href="/events/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3.5 text-[13px] font-medium text-white hover:bg-brand-hover">
            <Plus className="size-4" />New {ctx.config.t("event").toLowerCase()}
          </Link>
        }
      />
      <PageBody>
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={CalendarRange}
              title={`No ${ctx.config.t("event", "many").toLowerCase()} yet`}
              description={`Create one for a market stall, a fair, or any batch of production you want to plan.`}
              action={<Link href="/events/new" className="inline-flex h-9 items-center rounded-lg bg-brand px-3.5 text-[13px] font-medium text-white">New {ctx.config.t("event").toLowerCase()}</Link>}
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map(({ event, items }) => {
              const progress = computeEventProgress(items, threshold);
              const upcoming = event.startDate ? new Date(event.startDate) >= new Date(new Date().toDateString()) : false;
              return (
                <Link key={event.id} href={`/events/${event.id}`}>
                  <Card className="h-full transition hover:ring-line-strong">
                    <CardBody className="pt-5">
                      <div className="flex items-start gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge color={upcoming ? "teal" : "neutral"}>{upcoming ? "Upcoming" : "Past"}</Badge>
                            <span className="text-[11.5px] tabular text-ink-subtle">{event.code}</span>
                          </div>
                          <h3 className="mt-2 font-semibold truncate">{event.name}</h3>
                          <p className="text-[12.5px] text-ink-muted">
                            {event.startDate ? formatDate(event.startDate, ctx.config.dateFormat) : "No date"}
                            {event.location ? ` · ${event.location}` : ""}
                          </p>
                        </div>
                        <ProgressRing value={progress.progressPct} size={72} stroke={7}
                          caption={`${progress.totalCompleted}/${progress.totalPlanned}`} />
                      </div>
                      <div className="mt-4 flex items-baseline justify-between text-[12.5px]">
                        <span className="text-ink-muted">{progress.totalRemaining} left to make</span>
                        <span className="tabular font-medium">{ctx.config.money(progress.expectedRevenueMinor)}</span>
                      </div>
                    </CardBody>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </PageBody>
    </>
  );
}
