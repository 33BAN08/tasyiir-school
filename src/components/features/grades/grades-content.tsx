import { BookOpen, ChartNoAxesColumn, CircleAlert, GraduationCap, Lock, School } from "lucide-react";
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
import { getGradeSheet, getSheetClass, listClassSubjects, listTeacherPairs, listYearPeriods, type SheetClass } from "@/lib/grades/sheet";
import { listAcademicYears } from "@/lib/structure/academic-years";
import { listClasses } from "@/lib/structure/classes";
import { studentName, studentOtherName } from "@/lib/students/names";

import { GradeSheet } from "./grade-sheet";
import { PeriodSwitch } from "./period-switch";
import { StaffSheetPickers, TeacherPairPicker } from "./sheet-pickers";

export type GradesParams = { year?: string; class?: string; subject?: string; period?: string };

const empty = (icon: typeof BookOpen, title: string, description: string, action?: ReactNode) => (
  <Card className="py-0">
    <EmptyState icon={icon} title={title} description={description} action={action} />
  </Card>
);

/** Chooses the sheet (own pairs for a teacher; year / class / subject for staff), then shows it. */
export async function GradesContent({ user, params }: { user: CurrentUser; params: Promise<GradesParams> }) {
  const [access, modules, p, locale, t] = await Promise.all([
    getGradeAccess(user), getModules(), params, getLocale(), getTranslations("grades"),
  ]);
  if (!access) {
    if (!modules.has("grades")) return empty(GraduationCap, t("notInPlanTitle"), t("notInPlanDescription"));
    return redirect({ href: homeFor(user), locale });
  }
  const schoolId = user.schoolId as string;

  // --- Which class + subject -------------------------------------------------------------------------
  let klass: SheetClass | null = null;
  let subjectId = "";
  let pickers: ReactNode;
  if (access === "teacher") {
    const pairs = await listTeacherPairs(schoolId, user.id);
    if (pairs.length === 0) return empty(School, t("noPairsTitle"), t("noPairsDescription"));
    const pair = pairs.find((x) => x.classId === p.class && x.subjectId === p.subject) ?? pairs[0];
    klass = await getSheetClass(schoolId, pair.classId);
    subjectId = pair.subjectId;
    pickers = (
      <TeacherPairPicker
        pairs={pairs.map((x) => ({ classId: x.classId, subjectId: x.subjectId, label: `${x.className} · ${x.subjectName}`, color: x.subjectColor }))}
        value={`${pair.classId}:${pair.subjectId}`}
        periodId={p.period ?? ""}
      />
    );
  } else {
    const years = await listAcademicYears(schoolId);
    const year = years.find((y) => y.id === p.year) ?? years.find((y) => y.isCurrent) ?? years[0];
    if (!year) return empty(School, t("noYearTitle"), t("noYearDescription"));
    const classes = await listClasses(schoolId, year.id);
    const chosen = classes.find((c) => c.id === p.class) ?? classes[0];
    klass = chosen ? { id: chosen.id, name: chosen.name, yearId: year.id, levelId: chosen.levelId, trackId: chosen.trackId } : null;
    const subjects = klass ? await listClassSubjects(schoolId, klass) : [];
    subjectId = (subjects.find((s) => s.id === p.subject) ?? subjects[0])?.id ?? "";
    pickers = (
      <StaffSheetPickers
        years={years}
        yearId={year.id}
        classes={classes.map((c) => ({ id: c.id, label: c.name }))}
        classId={klass?.id ?? ""}
        subjects={subjects.map((s) => ({ id: s.id, label: s.name, color: s.color }))}
        subjectId={subjectId}
        periodId={p.period ?? ""}
      />
    );
    if (!klass) return <>{pickers}{empty(School, t("noClassesTitle"), t("noClassesDescription", { year: ltr(year.label) }))}</>;
    if (!subjectId) {
      const action = access === "manage" && (
        <Button asChild><Link href={`/setup/grading?year=${year.id}&section=coefficients`}>{t("noSubjectsAction")}</Link></Button>
      );
      return <>{pickers}{empty(BookOpen, t("noSubjectsTitle"), t("noSubjectsDescription", { class: klass.name }), action)}</>;
    }
  }
  if (!klass) return redirect({ href: homeFor(user), locale });

  // --- Which semester ----------------------------------------------------------------------------------
  const [periods, clock] = await Promise.all([listYearPeriods(schoolId, klass.yearId), schoolClock()]);
  if (periods.length === 0) return <>{pickers}{empty(Lock, t("noPeriodsTitle"), t("noPeriodsDescription"))}</>;
  const period = periods.find((x) => x.id === p.period)
    ?? periods.find((x) => x.startDate <= clock.date && clock.date <= x.endDate)
    ?? periods[0];

  const [sheet, averageRows] = await Promise.all([
    getGradeSheet(schoolId, klass, subjectId, period.id),
    // The sheet still opens if the averages cannot be read.
    getClassAverages(klass.id).catch(() => null),
  ]);
  const averages = averageRows && Object.fromEntries(
    averageRows.filter((r) => r.periodId === period.id && r.subjectId === subjectId).map((r) => [r.studentId, r.average]),
  );
  const canEdit = access !== "view" && !period.locked && sheet.graded;
  const query = access === "teacher" ? `class=${klass.id}&subject=${subjectId}` : `year=${klass.yearId}&class=${klass.id}&subject=${subjectId}`;
  const controls = sheet.columns.filter((c) => c.kind === "control" && !c.extra).length;
  const hasActivities = sheet.columns.some((c) => c.kind === "activities");
  const signature = Object.entries(sheet.marks).map(([k, v]) => `${k}=${v}`).sort().join(",");

  return (
    <div className="flex flex-col gap-3">
      {pickers}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PeriodSwitch periods={periods} active={period.id} query={query} />
        {access !== "teacher" && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/grades/averages?year=${klass.yearId}&class=${klass.id}&period=${period.id}`} data-averages-link>
              <ChartNoAxesColumn aria-hidden />
              {t("averagesLink")}
            </Link>
          </Button>
        )}
        <p className="text-sm text-muted-foreground" data-sheet-rules>
          {t("rules", { scale: ltr(`/${sheet.scale}`), controls })}
          {hasActivities && ` · ${t("withActivities")}`}
        </p>
      </div>
      {period.locked && (
        <p className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm" data-sheet-locked>
          <Lock className="size-4 shrink-0 text-warning" aria-hidden />
          {t("lockedBanner")}
        </p>
      )}
      {access === "view" && <p className="text-sm text-muted-foreground">{t("readOnly")}</p>}
      {!sheet.graded && (
        <p className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
          <CircleAlert className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {t("notGraded", { class: klass.name })}
        </p>
      )}
      <GradeSheet
        key={`${period.id}:${klass.id}:${subjectId}:${signature}`}
        userId={user.id}
        classId={klass.id}
        subjectId={subjectId}
        periodId={period.id}
        canEdit={canEdit}
        locked={period.locked}
        scale={sheet.scale}
        columns={sheet.columns}
        students={sheet.students.map((s) => ({ id: s.id, name: studentName(s, locale), otherName: studentOtherName(s, locale) }))}
        marks={sheet.marks}
        averages={sheet.graded ? averages : null}
      />
    </div>
  );
}
