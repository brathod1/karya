import { Skeleton, TableSkeleton } from "@/components/ui/empty";
import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <div className="px-4 sm:px-6 py-6 space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
      <Card className="overflow-hidden">
        <div className="border-b border-line px-3 py-2.5">
          <Skeleton className="h-9 w-full max-w-sm" />
        </div>
        <TableSkeleton rows={8} cols={7} />
      </Card>
    </div>
  );
}
