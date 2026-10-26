import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { CouncilContent, type CouncilParams } from "@/components/features/grades/council-content";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireArea } from "@/lib/auth/session";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Class-council remarks (Phase 11 step 8): one per student for a class and a
 * semester (or the year). grades.manage writes, grades.view reads; the access
 * itself is decided in CouncilContent, others go home.
 */
export default async function CouncilPage({ searchParams }: PageProps<"/[locale]/grades/council">) {
  const user = await requireArea("school");
  const t = await getTranslations("councilRemarks");
  const params = searchParams.then(
    (sp): CouncilParams => ({ year: one(sp.year), class: one(sp.class), period: one(sp.period) }),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<div className="flex flex-col gap-3"><Skeleton className="h-10 w-72" /><Skeleton className="h-80 w-full" /></div>}>
        <CouncilContent user={user} params={params} />
      </Suspense>
    </div>
  );
}
