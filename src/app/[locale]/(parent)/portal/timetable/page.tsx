import { ArrowLeft, CalendarDays } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { ReadOnlyWeek } from "@/components/features/timetable/read-only-week";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireArea } from "@/lib/auth/session";
import { isolate, ltr } from "@/lib/format";
import { listMyChildren } from "@/lib/parents/portal";
import { getSchoolWeek } from "@/lib/structure/time-slots";
import { studentName } from "@/lib/students/names";
import { getCurrentYear } from "@/lib/students/students";
import { getYearTimetable } from "@/lib/timetable/timetable";
import { cn } from "@/lib/utils";

/**
 * A child's class timetable for the parent (mobile-first, read-only). RLS gives
 * a parent only their own children and the lessons of their classes; teacher
 * names come from timetable_teachers() (no email, no phone).
 */
export default async function PortalTimetablePage({ searchParams }: PageProps<"/[locale]/portal/timetable">) {
  const user = await requireArea("portal");
  const [t, locale, sp] = await Promise.all([getTranslations("portal.timetable"), getLocale(), searchParams]);
  const children = user.schoolId ? await listMyChildren(user.schoolId) : [];
  const child = children.find((c) => c.id === sp.child) ?? children[0];
  const year = user.schoolId ? await getCurrentYear(user.schoolId) : null;

  const back = (
    <Button asChild variant="ghost" size="sm" className="self-start">
      <Link href="/portal">
        <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
        {t("back")}
      </Link>
    </Button>
  );
  if (!child || !user.schoolId) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Card className="py-0">
          <EmptyState icon={CalendarDays} title={t("noChildTitle")} description={t("noChildDescription")} />
        </Card>
      </div>
    );
  }

  const name = studentName(child, locale);
  const header = (
    <div className="flex flex-col gap-3">
      {back}
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {children.length > 1 && (
        <nav aria-label={t("children")} className="flex flex-wrap gap-2">
          {children.map((c) => (
            <Link
              key={c.id}
              href={`/portal/timetable?child=${c.id}`}
              aria-current={c.id === child.id ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-sm",
                c.id === child.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              <bdi>{studentName(c, locale)}</bdi>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );

  if (!child.classId || !year) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Card className="py-0">
          <EmptyState
            icon={CalendarDays}
            title={t("noClassTitle", { name: isolate(name) })}
            description={t("noClassDescription")}
          />
        </Card>
      </div>
    );
  }

  const [week, timetable] = await Promise.all([getSchoolWeek(user.schoolId, year.id), getYearTimetable(user.schoolId, year.id)]);
  const lessons = timetable.lessons.filter((l) => l.classId === child.classId);

  return (
    <div className="flex flex-col gap-4">
      {header}
      <p className="text-muted-foreground">
        {t("of", { name: isolate(name), class: isolate(child.className ?? ""), year: ltr(year.label) })}
      </p>
      {lessons.length === 0 ? (
        <Card className="py-0">
          <EmptyState icon={CalendarDays} title={t("notReadyTitle")} description={t("notReadyDescription")} />
        </Card>
      ) : (
        <ReadOnlyWeek days={week.days} slots={week.slots} lessons={lessons} details={["teacher", "room"]} layout="days" />
      )}
    </div>
  );
}
