import { Layers } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { yearMonths } from "@/lib/fees/months";
import { getFeeMonths, listFeePlans, listFeeServices } from "@/lib/fees/setup";
import type { AcademicYear } from "@/lib/structure/academic-years";
import type { CycleGroup } from "@/lib/structure/levels";

import { FeeMonthsForm } from "./fee-months-form";
import { FeePlansGrid } from "./fee-plans-grid";
import { FeeServicesList } from "./fee-services-list";

// The three parts of /fees/settings, read on the server (RLS: own school,
// fees module on, fees.view).

export async function MonthsSection({ year, canManage }: { year: AcademicYear; canManage: boolean }) {
  const [months, t] = await Promise.all([getFeeMonths(year.id), getTranslations("fees.months")]);
  if (!months) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      {/* Remounted when the saved value changes (after save / reset). */}
      <FeeMonthsForm
        key={`${months.months.join()}|${months.dueDay}|${months.customised}`}
        yearId={year.id}
        yearMonths={yearMonths(year.startDate, year.endDate)}
        value={months}
        canManage={canManage}
      />
    </div>
  );
}

export async function PlansSection({
  schoolId,
  year,
  groups,
  canManage,
  canEditStructure,
}: {
  schoolId: string;
  year: AcademicYear;
  groups: CycleGroup[];
  canManage: boolean;
  canEditStructure: boolean;
}) {
  const [plans, months, t, tCycles] = await Promise.all([
    listFeePlans(schoolId, year.id),
    getFeeMonths(year.id),
    getTranslations("fees.plans"),
    getTranslations("setup.levels.cycles"),
  ]);
  const withLevels = groups.filter((g) => g.levels.length > 0);
  if (withLevels.length === 0) {
    return (
      <Card className="py-0">
        <EmptyState
          icon={Layers}
          title={t("noLevelsTitle")}
          description={t("noLevelsDescription")}
          action={
            canEditStructure && (
              <Button asChild>
                <Link href="/setup/levels">{t("noLevelsAction")}</Link>
              </Button>
            )
          }
        />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <FeePlansGrid
        key={plans.map((p) => `${p.levelId}:${p.registration}:${p.monthly}`).sort().join()}
        yearId={year.id}
        groups={withLevels.map((g) => ({
          cycle: g.cycle,
          cycleName: tCycles(g.cycle),
          levels: g.levels.map((l) => ({ id: l.id, name: l.name })),
        }))}
        plans={plans}
        monthsCount={months?.months.length ?? 0}
        canManage={canManage}
      />
    </div>
  );
}

export async function ServicesSection({
  schoolId,
  year,
  canManage,
}: {
  schoolId: string;
  year: AcademicYear;
  canManage: boolean;
}) {
  const services = await listFeeServices(schoolId, year.id);
  return <FeeServicesList yearId={year.id} services={services} canManage={canManage} />;
}
