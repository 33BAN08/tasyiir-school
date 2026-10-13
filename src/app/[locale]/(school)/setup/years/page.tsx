import { CalendarRange } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { NewYearButton } from "@/components/features/setup/new-year-button";
import { SetupTabs } from "@/components/features/setup/setup-tabs";
import { YearsTable } from "@/components/features/setup/years-table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireSchoolPermission } from "@/lib/auth/session";
import { listAcademicYears, suggestAcademicYear } from "@/lib/structure/academic-years";

export default async function AcademicYearsPage() {
  const user = await requireSchoolPermission("structure.manage");
  const t = await getTranslations("setup");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <SetupTabs />
      <Suspense fallback={<YearsSkeleton />}>
        <YearsSection schoolId={user.schoolId} />
      </Suspense>
    </div>
  );
}

async function YearsSection({ schoolId }: { schoolId: string }) {
  const [years, t] = await Promise.all([listAcademicYears(schoolId), getTranslations("setup.years")]);
  const newYear = <NewYearButton suggestion={suggestAcademicYear(years)} />;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
        {years.length > 0 && newYear}
      </div>
      <Card className="py-0">
        {years.length === 0 ? (
          <EmptyState icon={CalendarRange} title={t("emptyTitle")} description={t("emptyDescription")} action={newYear} />
        ) : (
          <div className="flex flex-col gap-4 pb-4">
            <YearsTable years={years} />
            <p className="px-4 text-sm text-muted-foreground">{t("count", { count: years.length })}</p>
          </div>
        )}
      </Card>
    </section>
  );
}

function YearsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-64" />
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
