import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { YearSelect } from "@/components/features/setup/year-select";
import { ClassSelect } from "@/components/features/timetable/class-select";
import { TimetableView } from "@/components/features/timetable/timetable-view";
import { WeeklyHours } from "@/components/features/timetable/weekly-hours";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getPermissions, requireSchoolPermission } from "@/lib/auth/session";
import { isolate, ltr } from "@/lib/format";
import { listAcademicYears } from "@/lib/structure/academic-years";
import { getSchoolWeek } from "@/lib/structure/time-slots";
import { getYearTimetable } from "@/lib/timetable/timetable";

type Wanted = { year?: string; class?: string };

export default async function TimetablePage({ searchParams }: PageProps<"/[locale]/timetable">) {
  const user = await requireSchoolPermission("timetable.view");
  const [permissions, t] = await Promise.all([getPermissions(), getTranslations("timetable")]);
  const canManage = permissions.has("timetable.manage");
  const wanted = searchParams.then((sp): Wanted => ({
    year: typeof sp.year === "string" ? sp.year : undefined,
    class: typeof sp.class === "string" ? sp.class : undefined,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t(canManage ? "description" : "descriptionReadOnly")} />
      <Suspense fallback={<TimetableSkeleton />}>
        <ClassTimetable
          schoolId={user.schoolId}
          wanted={wanted}
          canManage={canManage}
          canSetUp={permissions.has("structure.manage")}
        />
      </Suspense>
    </div>
  );
}

type SectionProps = { schoolId: string; wanted: Promise<Wanted>; canManage: boolean; canSetUp: boolean };

async function ClassTimetable({ schoolId, wanted, canManage, canSetUp }: SectionProps) {
  const [years, want, t] = await Promise.all([listAcademicYears(schoolId), wanted, getTranslations("timetable")]);
  // The year asked for, else the current one, else the most recent.
  const year = years.find((y) => y.id === want.year) ?? years.find((y) => y.isCurrent) ?? years[0];
  if (!year) return <Missing what="years" canSetUp={canSetUp} />;

  const [week, timetable] = await Promise.all([getSchoolWeek(schoolId, year.id), getYearTimetable(schoolId, year.id)]);
  const yearSelect = <YearSelect years={years} value={year.id} />;
  if (timetable.classes.length === 0) return <Missing what="classes" canSetUp={canSetUp} controls={yearSelect} />;
  if (!week.slots.some((s) => s.kind === "lesson")) return <Missing what="slots" canSetUp={canSetUp} controls={yearSelect} />;

  const klass = timetable.classes.find((c) => c.id === want.class) ?? timetable.classes[0];
  const lessons = timetable.lessons.filter((l) => l.classId === klass.id);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        {yearSelect}
        <ClassSelect yearId={year.id} classes={timetable.classes} value={klass.id} />
      </div>
      <Card className="gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h2 className="text-lg font-semibold">{t("weekOf", { class: isolate(klass.name), year: ltr(year.label) })}</h2>
          <WeeklyHours lessons={lessons} slots={week.slots} />
        </div>
        {canManage && lessons.length === 0 && <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>}
        <TimetableView
          classId={klass.id}
          className={klass.name}
          days={week.days}
          slots={week.slots}
          lessons={lessons}
          canManage={canManage}
          choices={{
            subjects: timetable.subjects,
            teachers: timetable.teachers,
            rooms: timetable.rooms,
            yearLessons: timetable.lessons,
          }}
        />
      </Card>
    </section>
  );
}

const SETUP_PATH = { years: "/setup/years", classes: "/setup/classes", slots: "/setup/time-slots" } as const;

async function Missing({
  what,
  canSetUp,
  controls,
}: {
  what: keyof typeof SETUP_PATH;
  canSetUp: boolean;
  controls?: React.ReactNode;
}) {
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
            canSetUp && (
              <Button asChild>
                <Link href={SETUP_PATH[what]}>{t(`${what}.action`)}</Link>
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
