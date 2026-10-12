import { Suspense, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { HeaderActions } from "./header-actions";
import { PageSkeleton } from "./page-skeleton";
import { SchoolBrand } from "./school-brand";

type Props = { children: ReactNode };

/** Mobile-first shell for parents, students and drivers (bottom nav comes with their features). */
export function MobileShell({ children }: Props) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
        <Suspense fallback={<Skeleton className="h-8 w-40" />}>
          <SchoolBrand />
        </Suspense>
        <div className="flex-1" />
        <HeaderActions />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 p-4">
        {/* No auth gate here: layouts and pages render in parallel, so a layout
            check cannot stop a page from rendering. Each page calls requireArea(). */}
        <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
      </main>
    </div>
  );
}
