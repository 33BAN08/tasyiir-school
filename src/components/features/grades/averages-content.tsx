import { BookOpen, GraduationCap, Lock, School } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { schoolClock } from "@/lib/attendance/clock";
import { getModules } from "@/lib/auth/modules";
import { homeFor } from "@/lib/auth/roles";
import type { CurrentUser } from "@/lib/auth/session";
import { ltr } from "@/lib/format";
import { getGradeAccess } from "@/lib/grades/access";
import { getClassAverages } from "@/lib/grades/averages";
import { getGradeSheet, listClassSubjects, listYearPeriods } from "@/lib/grades/sheet";
import { listAcademicYears } from "@/lib/structure/academic-years";
import { listClasses } from "@/lib/structure/classes";
import { studentName, studentOtherName } from "@/lib/students/names";

import { AveragesTable } from "./averages-table";
import { PeriodSwitch, YEAR_TAB } from "./period-switch";
import { StaffSheetPickers } from "./sheet-pickers";

export type AveragesParams = { year?: string; class?: string; period?: string };

const empty = (icon: typeof BookOpen, title: string, description: string, action?: ReactNode) => (
  <Card className="py-0">
    <EmptyState icon={icon} title={title} description={description} action={action} />
  </Card>
);

/** Year + class + semester (or the year), then the class's averages table. */
export async function AveragesContent({ user, params }: { user: CurrentUser; params: Promise<AveragesParams> }) {
  const [access, modules, p, locale, t] = await Promise.all([
    getGradeAccess(user), getModules(), params, getLocale(), getTranslations("grades"),
  ]);
  if (!access) {
    if (!modules.has("grades")) return empty(GraduationCap, t("notInPlanTitle"), t("notInPlanDescription"));
    return redirect({ href: homeFor(user), locale });
  }
  // A teacher sees their subject's averages on their own sheet (/grades).
  if (access === "teacher") return redirect({ href: "/grades", locale });
  const schoolId = user.schoolId as string;

  const years = await listAcademicYears(schoolId);
  const year = years.find((y) => y.id === p.year) ?? years.find((y) => y.isCurrent) ?? years[0];
  if (!year) return empty(School, t("noYearTitle"), t("noYearDescription"));
  const classes = await listClasses(schoolId, year.id);
  const chosen = classes.find((c) => c.id === p.class) ?? classes[0];
  const pickers = (
    <StaffSheetPickers
      basePath="/grades/averages"
      years={years}
      yearId={year.id}
      classes={classes.map((c) => ({ id: c.id, label: c.name }))}
      classId={chosen?.id ?? ""}
      subjects={[]}
      subjectId=""
      periodId={p.period ?? ""}
    />
  );
  if (!chosen) return <>{pickers}{empty(School, t("noClassesTitle"), t("noClassesDescription", { year: ltr(year.label) }))}</>;
  const klass = { id: chosen.id, name: chosen.name, yearId: year.id, levelId: chosen.levelId, trackId: chosen.trackId };

  const [subjects, periods, clock] = await Promise.all([
    listClassSubjects(schoolId, klass), listYearPeriods(schoolId, year.id), schoolClock(),
  ]);
  if (subjects.length === 0) {
    const action = access === "manage" && (
      <Button asChild><Link href={`/setup/grading?year=${year.id}&section=coefficients`}>{t("noSubjectsAction")}</Link></Button>
    );
    return <>{pickers}{empty(BookOpen, t("noSubjectsTitle"), t("noSubjectsDescription", { class: klass.name }), action)}</>;
  }
  if (periods.length === 0) return <>{pickers}{empty(Lock, t("noPeriodsTitle"), t("noPeriodsDescription"))}</>;
  const period = p.period === YEAR_TAB ? null
    : periods.find((x) => x.id === p.period)
      ?? periods.find((x) => x.startDate <= clock.date && clock.date <= x.endDate)
      ?? periods[0];

  // The class's students (names) and scale come from the sheet reader; the numbers only from SQL.
  const [rows, sheet] = await Promise.all([
    getClassAverages(klass.id),
    getGradeSheet(schoolId, klass, subjects[0].id, period?.id ?? periods[0].id),
  ]);
  const periodRows = rows.filter((r) => r.periodId === (period?.id ?? null));
  const coefficients = new Map(periodRows.filter((r) => r.subjectId && r.coefficient !== null).map((r) => [r.subjectId as string, r.coefficient as number]));

  return (
    <div className="flex flex-col gap-3">
      {pickers}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PeriodSwitch
          periods={periods}
          active={period?.id ?? YEAR_TAB}
          query={`year=${year.id}&class=${klass.id}`}
          basePath="/grades/averages"
          withYear
        />
        <p className="text-sm text-muted-foreground" data-averages-scale>
          {t("averages.scale", { scale: ltr(`/${sheet.scale}`) })}
        </p>
      </div>
      <AveragesTable
        periodId={period?.id ?? null}
        subjects={subjects.map((s) => ({ ...s, coefficient: coefficients.get(s.id) ?? null }))}
        students={sheet.students.map((s) => ({ id: s.id, name: studentName(s, locale), otherName: studentOtherName(s, locale) }))}
        rows={periodRows}
        year={period === null}
      />
    </div>
  );
}
