import { BookOpen, Layers } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { listGradingPeriods, listLevelCoefficients, listLevelRules } from "@/lib/grading/setup";
import type { AcademicYear } from "@/lib/structure/academic-years";
import type { CycleGroup, Level } from "@/lib/structure/levels";
import { listSubjects } from "@/lib/structure/subjects";

import { CoefficientScopePicker } from "./coefficient-scope-picker";
import { CoefficientsList } from "./coefficients-list";
import { CopyLevelsDialog } from "./copy-levels-dialog";
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
  levels,
  levelId,
  trackId,
  canManage,
  canEditStructure,
}: {
  schoolId: string;
  yearId: string;
  levels: Level[];
  levelId: string | undefined;
  trackId: string | undefined;
  canManage: boolean;
  canEditStructure: boolean;
}) {
  if (levels.length === 0) return <NoLevels canEditStructure={canEditStructure} />;
  const level = levels.find((l) => l.id === levelId) ?? levels[0];
  const track = level.tracks.find((tr) => tr.id === trackId) ?? null;

  const [subjects, rows, rules, t] = await Promise.all([
    listSubjects(schoolId),
    listLevelCoefficients(schoolId, yearId, level.id),
    listLevelRules(yearId),
    getTranslations("grading.coefficients"),
  ]);
  const scope = { yearId, levelId: level.id, trackId: track?.id ?? null };
  const scopeRows = rows.filter((r) => r.trackId === scope.trackId);
  const commonRows = track ? rows.filter((r) => r.trackId === null) : [];
  const sourceName = track ? `${level.name} · ${track.name}` : level.name;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <CoefficientScopePicker
          yearId={yearId}
          levels={levels.map((l) => ({ id: l.id, name: l.name, tracks: l.tracks }))}
          levelId={level.id}
          trackId={scope.trackId}
        />
        {canManage && scopeRows.length > 0 && levels.length > 1 && (
          <CopyLevelsDialog
            scope={scope}
            sourceName={sourceName}
            levels={levels.filter((l) => l.id !== level.id).map((l) => ({ id: l.id, name: l.name }))}
            subjectNames={Object.fromEntries(subjects.map((s) => [s.id, s.name]))}
          />
        )}
      </div>
      {track && <p className="text-sm text-muted-foreground">{t("filiereNote", { track: track.name })}</p>}
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
        <CoefficientsList
          scope={scope}
          subjects={subjects.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
          rows={scopeRows}
          commonRows={commonRows}
          levelControls={rules.get(level.id)?.controlsCount ?? 4}
          canManage={canManage}
        />
      )}
    </div>
  );
}
