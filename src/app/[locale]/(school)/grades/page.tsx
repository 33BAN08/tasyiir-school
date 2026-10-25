import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { GradesContent, type GradesParams } from "@/components/features/grades/grades-content";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireArea } from "@/lib/auth/session";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Grade sheets (Phase 11 step 4): a teacher enters the marks of their own
 * class + subject pairs; grades.manage any class, any year; grades.view reads.
 * The access itself is decided in GradesContent (getGradeAccess); others go home.
 */
export default async function GradesPage({ searchParams }: PageProps<"/[locale]/grades">) {
  const user = await requireArea("school");
  const t = await getTranslations("grades");
  const params = searchParams.then(
    (sp): GradesParams => ({ year: one(sp.year), class: one(sp.class), subject: one(sp.subject), period: one(sp.period) }),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<GradesSkeleton />}>
        <GradesContent user={user} params={params} />
      </Suspense>
    </div>
  );
}

function GradesSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-9 w-40" />
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
