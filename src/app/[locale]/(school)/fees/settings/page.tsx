import { CalendarRange, Wallet } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FeeCopyDialog } from "@/components/features/fees/fee-copy-dialog";
import { FEES_SECTIONS, FeesSectionNav, type FeesSection } from "@/components/features/fees/fees-section-nav";
import { MonthsSection, PlansSection, ServicesSection } from "@/components/features/fees/fee-settings-sections";
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

type Params = { year?: string; section: FeesSection };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Fee settings per academic year (Phase 13): billed months + due day, fees per
 * level, services. fees.manage (director, accountant) changes them; fees.view
 * reads them. Fees module only (Premium).
 */
export default async function FeeSettingsPage({ searchParams }: PageProps<"/[locale]/fees/settings">) {
  const user = await requireSchoolPermission("fees.view");
  const [permissions, t] = await Promise.all([getPermissions(), getTranslations("fees")]);
  const params = searchParams.then((sp): Params => {
    const section = one(sp.section);
    return { year: one(sp.year), section: FEES_SECTIONS.find((s) => s === section) ?? "months" };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<FeeSettingsSkeleton />}>
        <FeeSettings
          schoolId={user.schoolId}
          params={params}
          canManage={permissions.has("fees.manage")}
          canEditStructure={permissions.has("structure.manage")}
        />
      </Suspense>
    </div>
  );
}

async function FeeSettings({
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
    getTranslations("fees"),
  ]);

  if (!modules.has("fees")) {
    return (
      <Card className="py-0">
        <EmptyState icon={Wallet} title={t("notInPlanTitle")} description={t("notInPlanDescription")} />
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
        <p className="text-sm text-muted-foreground">{t(canManage ? "intro" : "introReadOnly")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <YearSelect years={years} value={year.id} keep={`section=${p.section}`} />
          {canManage && earlierYears.length > 0 && (
            <FeeCopyDialog
              toYear={{ id: year.id, label: year.label }}
              earlierYears={earlierYears}
              levelNames={Object.fromEntries(levels.map((l) => [l.id, l.name]))}
            />
          )}
        </div>
      </div>
      <FeesSectionNav yearId={year.id} active={p.section} />
      {p.section === "months" && <MonthsSection year={year} canManage={canManage} />}
      {p.section === "plans" && (
        <PlansSection
          schoolId={schoolId}
          year={year}
          groups={groups}
          canManage={canManage}
          canEditStructure={canEditStructure}
        />
      )}
      {p.section === "services" && <ServicesSection schoolId={schoolId} year={year} canManage={canManage} />}
    </section>
  );
}

function FeeSettingsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}
