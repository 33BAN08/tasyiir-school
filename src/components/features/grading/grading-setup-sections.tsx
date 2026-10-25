import { BookOpen, Layers } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { listCycleCoefficients, listGradingPeriods, listLevelRules } from "@/lib/grading/setup";
import type { AcademicYear } from "@/lib/structure/academic-years";
import type { CycleGroup } from "@/lib/structure/levels";
import { listSubjects } from "@/lib/structure/subjects";
import { cn } from "@/lib/utils";

import { CoefficientGrid } from "./coefficient-grid";
import { LevelRulesList } from "./level-rules-list";
import { PeriodsList } from "./periods-list";

// The three parts of /setup/grading, read on the server (RLS: own school,
// grades module on).

export async function PeriodsSection({
  schoolId,
  year,
  canManage,
}: {
  schoolId: string;
  year: AcademicYear;
  canManage: boolean;
}) {
  const [periods, t] = await Promise.all([listGradingPeriods(schoolId, year.id), getTranslations("grading.periods")]);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      {periods.length === 0 ? (
        <Card className="py-0">
          <EmptyState icon={Layers} title={t("emptyTitle")} description={t("emptyDescription")} />
        </Card>
      ) : (
        <PeriodsList periods={periods} year={{ startDate: year.startDate, endDate: year.endDate }} canManage={canManage} />
      )}
    </div>
  );
}

/** "Create the levels first" (with a link for whoever may create them). */
async function NoLevels({ canEditStructure }: { canEditStructure: boolean }) {
  const t = await getTranslations("grading");
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

export async function RulesSection({
  yearId,
  groups,
  canManage,
  canEditStructure,
}: {
  yearId: string;
  groups: CycleGroup[];
  canManage: boolean;
  canEditStructure: boolean;
}) {
  if (groups.every((g) => g.levels.length === 0)) return <NoLevels canEditStructure={canEditStructure} />;
  const [rules, t, tCycles] = await Promise.all([
    listLevelRules(yearId),
    getTranslations("grading.rules"),
    getTranslations("setup.levels.cycles"),
  ]);
  const rulesGroups = groups
    .filter((g) => g.levels.length > 0)
    .map((g) => ({
      cycle: g.cycle,
      cycleLabel: tCycles(g.cycle),
      levels: g.levels.flatMap((l) => {
        const r = rules.get(l.id);
        return r ? [{ id: l.id, name: l.name, rules: r }] : [];
      }),
    }));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <LevelRulesList yearId={yearId} groups={rulesGroups} canManage={canManage} />
    </div>
  );
}

export async function CoefficientsSection({
  schoolId,
  yearId,
  groups,
  cycle,
  canManage,
  canEditStructure,
}: {
  schoolId: string;
  yearId: string;
  groups: CycleGroup[];
  cycle: string | undefined;
  canManage: boolean;
  canEditStructure: boolean;
}) {
  const cycles = groups.filter((g) => g.levels.length > 0);
  if (cycles.length === 0) return <NoLevels canEditStructure={canEditStructure} />;
  const group = cycles.find((g) => g.cycle === cycle) ?? cycles[0];

  const [subjects, rows, rules, t, tCycles] = await Promise.all([
    listSubjects(schoolId),
    listCycleCoefficients(schoolId, yearId, group.levels.map((l) => l.id)),
    listLevelRules(yearId),
    getTranslations("grading.coefficients"),
    getTranslations("setup.levels.cycles"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      {cycles.length > 1 && (
        <nav aria-label={t("cycleLabel")} className="flex flex-wrap gap-2">
          {cycles.map((g) => (
            <Link
              key={g.cycle}
              href={`/setup/grading?year=${yearId}&section=coefficients&cycle=${g.cycle}`}
              aria-current={g.cycle === group.cycle ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                g.cycle === group.cycle
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tCycles(g.cycle)}
            </Link>
          ))}
        </nav>
      )}
      {subjects.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icon={BookOpen}
            title={t("noSubjectsTitle")}
            description={t("noSubjectsDescription")}
            action={
              canEditStructure && (
                <Button asChild>
                  <Link href="/setup/subjects">{t("noSubjectsAction")}</Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <CoefficientGrid
          // A new grid (fresh drafts) whenever the saved values change.
          key={`${group.cycle}:${rows.map((r) => `${r.id}:${r.coefficient}:${r.controlsCount}:${r.position}`).join(",")}`}
          yearId={yearId}
          levels={group.levels.map((l) => ({
            id: l.id,
            name: l.name,
            tracks: l.tracks.map((tr) => ({ id: tr.id, name: tr.name })),
            controlsCount: rules.get(l.id)?.controlsCount ?? 4,
          }))}
          subjects={subjects.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
          rows={rows}
          canManage={canManage}
        />
      )}
    </div>
  );
}
