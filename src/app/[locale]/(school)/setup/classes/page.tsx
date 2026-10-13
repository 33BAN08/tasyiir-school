import { School } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";

import { ClassesList } from "@/components/features/setup/classes-list";
import { NewClassButtons } from "@/components/features/setup/new-class-buttons";
import { SetupTabs } from "@/components/features/setup/setup-tabs";
import { YearSelect } from "@/components/features/setup/year-select";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireSchoolPermission } from "@/lib/auth/session";
import { listAcademicYears } from "@/lib/structure/academic-years";
import { listClasses } from "@/lib/structure/classes";
import { listLevelsByCycle } from "@/lib/structure/levels";

export default async function ClassesPage({ searchParams }: PageProps<"/[locale]/setup/classes">) {
  const user = await requireSchoolPermission("structure.manage");
  const t = await getTranslations("setup");
  const year = searchParams.then((sp) => (typeof sp.year === "string" ? sp.year : undefined));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <SetupTabs />
      <Suspense fallback={<ClassesSkeleton />}>
        <ClassesSection schoolId={user.schoolId} requestedYear={year} />
      </Suspense>
    </div>
  );
}

type SectionProps = { schoolId: string; requestedYear: Promise<string | undefined> };

async function ClassesSection({ schoolId, requestedYear }: SectionProps) {
  const [years, groups, wanted, t] = await Promise.all([
    listAcademicYears(schoolId),
    listLevelsByCycle(schoolId),
    requestedYear,
    getTranslations("setup.classes"),
  ]);
  const levels = groups.flatMap((g) => g.levels);
  // The year asked for, else the current one, else the most recent.
  const year = years.find((y) => y.id === wanted) ?? years.find((y) => y.isCurrent) ?? years[0];

  const header = (actions?: ReactNode) => (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {actions}
    </div>
  );

  // Classes need a year and levels first.
  const missing = !year ? "years" : levels.length === 0 ? "levels" : null;
  if (missing) {
    return (
      <section className="flex flex-col gap-4">
        {header()}
        <Card className="py-0">
          <EmptyState
            icon={School}
            title={t(`missing.${missing}.title`)}
            description={t(`missing.${missing}.description`)}
            action={
              <Button asChild>
                <Link href={`/setup/${missing}`}>{t(`missing.${missing}.action`)}</Link>
              </Button>
            }
          />
        </Card>
      </section>
    );
  }

  const classes = await listClasses(schoolId, year.id);
  const buttons = (
    <NewClassButtons academicYearId={year.id} levels={levels} takenNames={classes.map((c) => c.name)} />
  );

  return (
    <section className="flex flex-col gap-4">
      {header(<YearSelect years={years} value={year.id} />)}
      {classes.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icon={School}
            title={t("emptyTitle", { year: year.label })}
            description={t("emptyDescription")}
            action={buttons}
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t("count", { count: classes.length, year: year.label })}</p>
            {buttons}
          </div>
          <ClassesList academicYearId={year.id} levels={levels} classes={classes} />
        </>
      )}
    </section>
  );
}

function ClassesSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    </div>
  );
}
