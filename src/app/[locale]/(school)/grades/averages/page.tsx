import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { AveragesContent, type AveragesParams } from "@/components/features/grades/averages-content";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireArea } from "@/lib/auth/session";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Averages and ranks of a class (Phase 11 step 5), per semester and for the
 * year, read from public.class_averages(). grades.view / grades.manage only;
 * the access itself is decided in AveragesContent, others go home.
 */
export default async function AveragesPage({ searchParams }: PageProps<"/[locale]/grades/averages">) {
  const user = await requireArea("school");
  const t = await getTranslations("grades.averages");
  const params = searchParams.then(
    (sp): AveragesParams => ({ year: one(sp.year), class: one(sp.class), period: one(sp.period) }),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<AveragesSkeleton />}>
        <AveragesContent user={user} params={params} />
      </Suspense>
    </div>
  );
}

function AveragesSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-80 w-full" />
    </div>
  );
}
