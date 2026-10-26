import { GraduationCap, Lock, School } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { redirect } from "@/i18n/navigation";
import { schoolClock } from "@/lib/attendance/clock";
import { getModules } from "@/lib/auth/modules";
import { homeFor } from "@/lib/auth/roles";
import type { CurrentUser } from "@/lib/auth/session";
import { ltr } from "@/lib/format";
import { getGradeAccess } from "@/lib/grades/access";
import { listClassStudents, listCouncilRemarks } from "@/lib/grades/council";
import { getPublication } from "@/lib/grades/publications";
import { listYearPeriods } from "@/lib/grades/sheet";
import { listAcademicYears } from "@/lib/structure/academic-years";
import { listClasses } from "@/lib/structure/classes";
import { studentName, studentOtherName } from "@/lib/students/names";

import { CouncilSheet } from "./council-sheet";
import { PeriodSwitch, YEAR_TAB } from "./period-switch";
import { StaffSheetPickers } from "./sheet-pickers";

export type CouncilParams = { year?: string; class?: string; period?: string };

const empty = (icon: typeof School, title: string, description: string, action?: ReactNode) => (
  <Card className="py-0">
    <EmptyState icon={icon} title={title} description={description} action={action} />
  </Card>
);

/** Year + class + semester (or the year), then one class-council remark per student. */
export async function CouncilContent({ user, params }: { user: CurrentUser; params: Promise<CouncilParams> }) {
  const [access, modules, p, locale, t, tc] = await Promise.all([
    getGradeAccess(user), getModules(), params, getLocale(), getTranslations("grades"), getTranslations("councilRemarks"),
  ]);
  if (!access) {
    if (!modules.has("grades")) return empty(GraduationCap, t("notInPlanTitle"), t("notInPlanDescription"));
    return redirect({ href: homeFor(user), locale });
  }
  if (access === "teacher") return redirect({ href: "/grades", locale });
  const schoolId = user.schoolId as string;

  const years = await listAcademicYears(schoolId);
  const year = years.find((y) => y.id === p.year) ?? years.find((y) => y.isCurrent) ?? years[0];
  if (!year) return empty(School, t("noYearTitle"), t("noYearDescription"));
  const classes = await listClasses(schoolId, year.id);
  const chosen = classes.find((c) => c.id === p.class) ?? classes[0];
  const pickers = (
    <StaffSheetPickers
      basePath="/grades/council"
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

  const [periods, clock] = await Promise.all([listYearPeriods(schoolId, year.id), schoolClock()]);
  if (periods.length === 0) return <>{pickers}{empty(Lock, t("noPeriodsTitle"), t("noPeriodsDescription"))}</>;
  const period = p.period === YEAR_TAB ? null
    : periods.find((x) => x.id === p.period)
      ?? periods.find((x) => x.startDate <= clock.date && clock.date <= x.endDate)
      ?? periods[0];
  const [students, remarks, publication] = await Promise.all([
    listClassStudents(schoolId, chosen.id, year.id),
    listCouncilRemarks(chosen.id, period?.id ?? null),
    getPublication(chosen.id, period?.id ?? null),
  ]);
  const changedSince = publication
    ? [...remarks.values()].filter((r) => r.updatedAt > publication.publishedAt).length
    : 0;

  return (
    <div className="flex flex-col gap-3">
      {pickers}
      <PeriodSwitch
        periods={periods}
        active={period?.id ?? YEAR_TAB}
        query={`year=${year.id}&class=${chosen.id}`}
        basePath="/grades/council"
        withYear
      />
      <p className="text-sm text-muted-foreground" data-council-note>
        {publication ? tc(changedSince > 0 ? "changedSincePublished" : "published", { count: changedSince }) : tc("notPublished")}
      </p>
      {access === "view" && <p className="text-sm text-muted-foreground">{tc("readOnly")}</p>}
      <CouncilSheet
        key={`${chosen.id}:${period?.id ?? YEAR_TAB}:${[...remarks.values()].map((r) => r.updatedAt).join()}`}
        classId={chosen.id}
        periodId={period?.id ?? null}
        canEdit={access === "manage"}
        students={students.map((s) => ({ id: s.id, name: studentName(s, locale), otherName: studentOtherName(s, locale) }))}
        remarks={Object.fromEntries([...remarks.values()].map((r) => [r.studentId, r.body]))}
      />
    </div>
  );
}
