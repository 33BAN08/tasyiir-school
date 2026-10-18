import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { PrintSheet } from "@/components/features/timetable/print-sheet";
import { PrintToolbar } from "@/components/features/timetable/print-toolbar";
import { redirect } from "@/i18n/navigation";
import { homeFor } from "@/lib/auth/roles";
import { getCurrentSchool, getPermissions, requireArea } from "@/lib/auth/session";
import { listAcademicYears } from "@/lib/structure/academic-years";
import { getSchoolWeek } from "@/lib/structure/time-slots";
import { getYearTimetable } from "@/lib/timetable/timetable";
import type { TimetableLesson, TimetableOption } from "@/lib/timetable/types";
import { TIMETABLE_VIEWS, VIEW_DETAILS, type TimetableViewKind } from "@/lib/timetable/views";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("timetable.print");
  return { title: t("pageTitle") };
}

/**
 * Timetables to print or save as PDF, one A4 landscape page each (the
 * browser's print dialog does the PDF, which keeps Arabic shaping and RTL
 * right). `?view=class|teacher|room&id=…&year=…`, or `&all=1` for every class
 * / teacher / room of the year that has lessons. Timetable staff print any;
 * a teacher prints only their own week of the current year. No app shell.
 */
export default function PrintTimetablePage({ searchParams }: PageProps<"/[locale]/print/timetable">) {
  // No app shell here: this boundary is where the session and the search params are read.
  return (
    <Suspense>
      <PrintTimetable searchParams={searchParams} />
    </Suspense>
  );
}

async function PrintTimetable({ searchParams }: Pick<PageProps<"/[locale]/print/timetable">, "searchParams">) {
  const user = await requireArea("school");
  const [permissions, sp, school] = await Promise.all([getPermissions(), searchParams, getCurrentSchool()]);
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const isStaff = permissions.has("timetable.view") || permissions.has("timetable.manage");
  const ownOnly = !isStaff && user.roleKey === "teacher";
  if (!user.schoolId || !school || (!isStaff && !ownOnly)) {
    return redirect({ href: homeFor(user), locale: await getLocale() });
  }

  const years = await listAcademicYears(user.schoolId);
  const current = years.find((y) => y.isCurrent);
  const year = ownOnly ? current : (years.find((y) => y.id === one(sp.year)) ?? current ?? years[0]);
  const view: TimetableViewKind = ownOnly ? "teacher" : (TIMETABLE_VIEWS.find((v) => v === one(sp.view)) ?? "class");
  const backHref = ownOnly ? "/my-timetable" : `/timetable?view=${view}${year ? `&year=${year.id}` : ""}`;

  const sheets: { id: string; name: string; lessons: TimetableLesson[] }[] = [];
  const week = year ? await getSchoolWeek(user.schoolId, year.id) : null;
  if (year && week) {
    const timetable = await getYearTimetable(user.schoolId, year.id);
    const options: TimetableOption[] = ownOnly
      ? [{ id: user.id, name: user.fullName }]
      : view === "class"
        ? timetable.classes
        : view === "teacher"
          ? timetable.teachers
          : timetable.rooms;
    const of = (option: TimetableOption) =>
      timetable.lessons.filter((l) =>
        view === "class" ? l.classId === option.id : view === "teacher" ? l.teacherId === option.id : l.roomId === option.id,
      );
    if (!ownOnly && one(sp.all) === "1") {
      for (const option of options) {
        const lessons = of(option);
        if (lessons.length > 0) sheets.push({ ...option, lessons });
      }
    } else {
      const option = options.find((o) => o.id === one(sp.id)) ?? options[0];
      if (option) sheets.push({ ...option, lessons: of(option) });
    }
  }

  const t = await getTranslations("timetable.print");
  return (
    <>
      {/* A4 landscape, 10 mm margins: each sheet is 277 × 190 mm. */}
      <style>
        {"@page { size: A4 landscape; margin: 10mm; }" +
          // The app's full-height body, the toaster and the route announcer would add an empty last page.
          "@media print { html, body { height: auto !important; min-height: 0 !important; background: none !important; }" +
          " body > :not(main) { display: none !important; } }"}
      </style>
      <PrintToolbar backHref={backHref} sheets={sheets.length} />
      <main className="flex flex-1 flex-col items-center gap-6 overflow-x-auto bg-muted p-6 print:block print:overflow-visible print:bg-transparent print:p-0">
        {sheets.length === 0 || !year || !week ? (
          <p className="text-muted-foreground">{t("nothing")}</p>
        ) : (
          sheets.map((sheet) => (
            <PrintSheet
              key={sheet.id}
              school={{ name: school.name, logoUrl: school.logoUrl }}
              view={view}
              name={sheet.name}
              yearLabel={year.label}
              days={week.days}
              slots={week.slots}
              lessons={sheet.lessons}
              details={VIEW_DETAILS[view]}
            />
          ))
        )}
      </main>
    </>
  );
}
