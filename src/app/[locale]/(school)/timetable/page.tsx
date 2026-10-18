import { CalendarDays, Printer } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";

import { YearSelect } from "@/components/features/setup/year-select";
import { CopyLessonsDialog, type CopySourceYear } from "@/components/features/timetable/copy-lessons-dialog";
import { TeacherHours } from "@/components/features/timetable/teacher-hours";
import { TimetableView } from "@/components/features/timetable/timetable-view";
import { TimetableSelect, ViewTabs } from "@/components/features/timetable/view-controls";
import { WeeklyHours } from "@/components/features/timetable/weekly-hours";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getPermissions, requireSchoolPermission } from "@/lib/auth/session";
import { isolate, ltr } from "@/lib/format";
import { listAcademicYears, type AcademicYear } from "@/lib/structure/academic-years";
import { listClasses } from "@/lib/structure/classes";
import { getSchoolWeek } from "@/lib/structure/time-slots";
import { getYearTimetable } from "@/lib/timetable/timetable";
import type { TimetableLesson, TimetableOption } from "@/lib/timetable/types";
import { TIMETABLE_VIEWS, VIEW_DETAILS, type TimetableViewKind } from "@/lib/timetable/views";

type Wanted = { year?: string; view?: string; class?: string; teacher?: string; room?: string };

export default async function TimetablePage({ searchParams }: PageProps<"/[locale]/timetable">) {
  const user = await requireSchoolPermission("timetable.view");
  const [permissions, t] = await Promise.all([getPermissions(), getTranslations("timetable")]);
  const canManage = permissions.has("timetable.manage");
  const wanted = searchParams.then((sp): Wanted => {
    const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
    return { year: one(sp.year), view: one(sp.view), class: one(sp.class), teacher: one(sp.teacher), room: one(sp.room) };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t(canManage ? "description" : "descriptionReadOnly")} />
      <Suspense fallback={<TimetableSkeleton />}>
        <WeekSection schoolId={user.schoolId} wanted={wanted} canManage={canManage} permissions={permissions} />
      </Suspense>
    </div>
  );
}

type SectionProps = { schoolId: string; wanted: Promise<Wanted>; canManage: boolean; permissions: Set<string> };

async function WeekSection({ schoolId, wanted, canManage, permissions }: SectionProps) {
  const [years, want, t] = await Promise.all([listAcademicYears(schoolId), wanted, getTranslations("timetable")]);
  const canSetUp = permissions.has("structure.manage");
  // The year asked for, else the current one, else the most recent.
  const year = years.find((y) => y.id === want.year) ?? years.find((y) => y.isCurrent) ?? years[0];
  if (!year) return <Missing what="years" canFix={canSetUp} />;

  const [week, timetable] = await Promise.all([getSchoolWeek(schoolId, year.id), getYearTimetable(schoolId, year.id)]);
  const view = TIMETABLE_VIEWS.find((v) => v === want.view) ?? "class";
  const controls = (select?: ReactNode) => (
    <>
      <YearSelect years={years} value={year.id} keep={`view=${view}`} />
      <ViewTabs yearId={year.id} value={view} />
      {select}
    </>
  );
  if (timetable.classes.length === 0) return <Missing what="classes" canFix={canSetUp} controls={controls()} />;
  if (!week.slots.some((s) => s.kind === "lesson")) return <Missing what="slots" canFix={canSetUp} controls={controls()} />;

  // Whose week: the class, teacher or room asked for, else the first one.
  const options: TimetableOption[] =
    view === "class" ? timetable.classes : view === "teacher" ? timetable.teachers : timetable.rooms;
  if (options.length === 0) {
    const what = view === "teacher" ? "teachers" : "rooms";
    const canFix = what === "teachers" ? permissions.has("teachers.manage") : canSetUp;
    return <Missing what={what} canFix={canFix} controls={controls()} />;
  }
  const selected = options.find((o) => o.id === want[view]) ?? options[0];
  const belongs: Record<TimetableViewKind, (l: TimetableLesson) => boolean> = {
    class: (l) => l.classId === selected.id,
    teacher: (l) => l.teacherId === selected.id,
    room: (l) => l.roomId === selected.id,
  };
  const lessons = timetable.lessons.filter(belongs[view]);
  // An empty class of the current year can start from an earlier year's timetable.
  const copySources =
    canManage && view === "class" && year.isCurrent && lessons.length === 0 ? await earlierYears(schoolId, years, year) : [];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        {controls(<TimetableSelect key={view} yearId={year.id} view={view} options={options} value={selected.id} />)}
      </div>
      <Card className="gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{t("weekOf", { class: isolate(selected.name), year: ltr(year.label) })}</h2>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/print/timetable?year=${year.id}&view=${view}&id=${selected.id}`} target="_blank">
                  <Printer aria-hidden />
                  {t("print.button")}
                </Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={`/print/timetable?year=${year.id}&view=${view}&all=1`} target="_blank">
                  {t(`print.all.${view}`)}
                </Link>
              </Button>
            </div>
          </div>
          <WeeklyHours lessons={lessons} slots={week.slots} />
        </div>
        {canManage && view !== "class" && <p className="text-sm text-muted-foreground">{t("addFromClass")}</p>}
        {canManage && view === "class" && lessons.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
            {copySources.length > 0 && <CopyLessonsDialog target={selected} yearLabel={year.label} sources={copySources} />}
          </div>
        )}
        <TimetableView
          days={week.days}
          slots={week.slots}
          lessons={lessons}
          details={VIEW_DETAILS[view]}
          canManage={canManage}
          addTo={view === "class" ? selected : undefined}
          choices={{
            subjects: timetable.subjects,
            teachers: timetable.teachers,
            rooms: timetable.rooms,
            yearLessons: timetable.lessons,
          }}
        />
      </Card>
      {view === "teacher" && (
        <Card className="p-4">
          <TeacherHours
            yearId={year.id}
            teachers={timetable.teachers}
            lessons={timetable.lessons}
            slots={week.slots}
            currentId={selected.id}
          />
        </Card>
      )}
    </section>
  );
}

/** Years before `year` that have classes, most recent first, with their classes. */
async function earlierYears(schoolId: string, years: AcademicYear[], year: AcademicYear): Promise<CopySourceYear[]> {
  const earlier = years.filter((y) => y.startDate < year.startDate).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const withClasses = await Promise.all(
    earlier.map(async (y) => ({
      id: y.id,
      label: y.label,
      classes: (await listClasses(schoolId, y.id)).map((c) => ({ id: c.id, name: c.name })),
    })),
  );
  return withClasses.filter((y) => y.classes.length > 0);
}

const FIX_PATH = {
  years: "/setup/years",
  classes: "/setup/classes",
  slots: "/setup/time-slots",
  teachers: "/teachers",
  rooms: "/setup/rooms",
} as const;

async function Missing({ what, canFix, controls }: { what: keyof typeof FIX_PATH; canFix: boolean; controls?: ReactNode }) {
  const t = await getTranslations("timetable.missing");
  return (
    <section className="flex flex-col gap-4">
      {controls && <div className="flex flex-wrap items-center gap-4">{controls}</div>}
      <Card className="py-0">
        <EmptyState
          icon={CalendarDays}
          title={t(`${what}.title`)}
          description={t(`${what}.description`)}
          action={
            canFix && (
              <Button asChild>
                <Link href={FIX_PATH[what]}>{t(`${what}.action`)}</Link>
              </Button>
            )
          }
        />
      </Card>
    </section>
  );
}

function TimetableSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-96" />
      <Skeleton className="h-[28rem] w-full" />
    </div>
  );
}
