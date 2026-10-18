import { CalendarDays, Printer } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { ReadOnlyWeek } from "@/components/features/timetable/read-only-week";
import { WeeklyHours } from "@/components/features/timetable/weekly-hours";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { homeFor } from "@/lib/auth/roles";
import { requireArea } from "@/lib/auth/session";
import { ltr } from "@/lib/format";
import { getSchoolWeek } from "@/lib/structure/time-slots";
import { getCurrentYear } from "@/lib/students/students";
import { getYearTimetable } from "@/lib/timetable/timetable";

/**
 * A teacher's own week, current year (mobile-first, read-only): class, subject
 * and room of each lesson, the lesson going on now and the next one. RLS gives
 * a teacher only their own lessons; the filter below is a second fence.
 */
export default async function MyTimetablePage() {
  const user = await requireArea("school");
  if (user.roleKey !== "teacher" || !user.schoolId) return redirect({ href: homeFor(user), locale: await getLocale() });
  const [t, tPrint, year] = await Promise.all([
    getTranslations("timetable.mine"),
    getTranslations("timetable.print"),
    getCurrentYear(user.schoolId),
  ]);

  if (!year) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t("title")} />
        <Card className="py-0">
          <EmptyState icon={CalendarDays} title={t("noYearTitle")} description={t("noYearDescription")} />
        </Card>
      </div>
    );
  }

  const [week, timetable] = await Promise.all([getSchoolWeek(user.schoolId, year.id), getYearTimetable(user.schoolId, year.id)]);
  const lessons = timetable.lessons.filter((l) => l.teacherId === user.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description", { year: ltr(year.label) })}
        actions={
          lessons.length > 0 && (
            <Button asChild variant="outline">
              <Link href="/print/timetable" target="_blank">
                <Printer aria-hidden />
                {tPrint("button")}
              </Link>
            </Button>
          )
        }
      />
      {lessons.length === 0 ? (
        <Card className="py-0">
          <EmptyState icon={CalendarDays} title={t("emptyTitle")} description={t("emptyDescription")} />
        </Card>
      ) : (
        <>
          <ReadOnlyWeek days={week.days} slots={week.slots} lessons={lessons} details={["class", "room"]} layout="responsive" />
          <Card className="p-4">
            <WeeklyHours lessons={lessons} slots={week.slots} />
          </Card>
        </>
      )}
    </div>
  );
}
