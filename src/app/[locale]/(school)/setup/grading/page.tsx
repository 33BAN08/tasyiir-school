import { CalendarRange, GraduationCap } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { CopyYearDialog } from "@/components/features/grading/copy-year-dialog";
import { GradingSectionNav, GRADING_SECTIONS, type GradingSection } from "@/components/features/grading/grading-section-nav";
import {
  CoefficientsSection,
  PeriodsSection,
  RulesSection,
} from "@/components/features/grading/grading-setup-sections";
import { SetupTabs } from "@/components/features/setup/setup-tabs";
import { YearSelect } from "@/components/features/setup/year-select";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getModules } from "@/lib/auth/modules";
import { getPermissions, requireSchoolPermission } from "@/lib/auth/session";
import { listAcademicYears } from "@/lib/structure/academic-years";
import { listLevelsByCycle } from "@/lib/structure/levels";

type Params = { year?: string; section: GradingSection; cycle?: string };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Grading setup per academic year (Phase 11): semesters, rules per level,
 * coefficients. grades.manage (director) changes it; grades.view (surveillant)
 * reads it. Grades module only (Pro / Premium).
 */
export default async function GradingSetupPage({ searchParams }: PageProps<"/[locale]/setup/grading">) {
  const user = await requireSchoolPermission("grades.view");
  const [permissions, t] = await Promise.all([getPermissions(), getTranslations()]);
  const params = searchParams.then((sp): Params => {
    const section = one(sp.section);
    return {
      year: one(sp.year),
      section: GRADING_SECTIONS.find((s) => s === section) ?? "periods",
      cycle: one(sp.cycle),
    };
  });
  // A surveillant only has this tab: the page is named after it.
  const structure = permissions.has("structure.manage");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={structure ? t("setup.title") : t("grading.title")}
        description={structure ? t("setup.description") : t("grading.description")}
      />
      <SetupTabs />
      <Suspense fallback={<GradingSkeleton />}>
        <GradingSetup
          schoolId={user.schoolId}
          params={params}
          canManage={permissions.has("grades.manage")}
          canEditStructure={structure}
        />
      </Suspense>
    </div>
  );
}

async function GradingSetup({
  schoolId,
  params,
  canManage,
  canEditStructure,
}: {
  schoolId: string;
  params: Promise<Params>;
  canManage: boolean;
  canEditStructure: boolean;
}) {
  const [modules, years, groups, p, t] = await Promise.all([
    getModules(),
    listAcademicYears(schoolId),
    listLevelsByCycle(schoolId),
    params,
    getTranslations("grading"),
  ]);

  if (!modules.has("grades")) {
    return (
      <Card className="py-0">
        <EmptyState icon={GraduationCap} title={t("notInPlanTitle")} description={t("notInPlanDescription")} />
      </Card>
    );
  }

  const year = years.find((y) => y.id === p.year) ?? years.find((y) => y.isCurrent) ?? years[0];
  if (!year) {
    return (
      <Card className="py-0">
        <EmptyState
          icon={CalendarRange}
          title={t("noYearTitle")}
          description={t("noYearDescription")}
          action={
            canEditStructure && (
              <Button asChild>
                <Link href="/setup/years">{t("noYearAction")}</Link>
              </Button>
            )
          }
        />
      </Card>
    );
  }

  const earlierYears = years.filter((y) => y.startDate < year.startDate).map((y) => ({ id: y.id, label: y.label }));
  const levels = groups.flatMap((g) => g.levels);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          {/* Without the structure tabs the page header already says "Notes et bulletins". */}
          {canEditStructure && <h2 className="text-lg font-semibold">{t("title")}</h2>}
          <p className="text-sm text-muted-foreground">{t(canManage ? "intro" : "introReadOnly")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <YearSelect years={years} value={year.id} keep={`section=${p.section}`} />
          {canManage && earlierYears.length > 0 && levels.length > 0 && (
            <CopyYearDialog
              toYear={{ id: year.id, label: year.label }}
              earlierYears={earlierYears}
              levelNames={Object.fromEntries(levels.map((l) => [l.id, l.name]))}
            />
          )}
        </div>
      </div>
      <GradingSectionNav yearId={year.id} active={p.section} />
      {p.section === "periods" && <PeriodsSection schoolId={schoolId} year={year} canManage={canManage} />}
      {p.section === "rules" && (
        <RulesSection yearId={year.id} groups={groups} canManage={canManage} canEditStructure={canEditStructure} />
      )}
      {p.section === "coefficients" && (
        <CoefficientsSection
          schoolId={schoolId}
          yearId={year.id}
          groups={groups}
          cycle={p.cycle}
          canManage={canManage}
          canEditStructure={canEditStructure}
        />
      )}
    </section>
  );
}

function GradingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-9 w-80" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
