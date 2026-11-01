import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder of the unpaid list and the journal while they load. */
export function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-11 w-96 max-w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
