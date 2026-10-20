import { useTranslations } from "next-intl";

import { TimeRange } from "@/components/features/setup/time-slot-day-card";
import { BRAND } from "@/lib/brand";
import { ltr } from "@/lib/format";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import type { TimetableLesson } from "@/lib/timetable/types";
import type { TimetableViewKind } from "@/lib/timetable/views";

import { LessonCard, type LessonDetail } from "./lesson-card";
import { WeeklyHours } from "./weekly-hours";
import { weekRows } from "./week-layout";

type Props = {
  school: { name: string; logoUrl: string | null };
  view: TimetableViewKind;
  /** The class's, teacher's or room's name. */
  name: string;
  yearLabel: string;
  days: SchoolDay[];
  slots: TimeSlot[];
  lessons: TimetableLesson[];
  details: LessonDetail[];
};

/**
 * One A4 landscape page: school, whose week and which year on top, the week
 * as a table, weekly hours at the bottom. Fills the page when printed (the
 * rows share the height; breaks stay thin; 2 mm under the printable height, or
 * Chrome rounds it onto an extra blank page); the next sheet starts a new page.
 */
export function PrintSheet({ school, view, name, yearLabel, days, slots, lessons, details }: Props) {
  const t = useTranslations("timetable.print");
  const tGrid = useTranslations("timetable.grid");
  const tDays = useTranslations("setup.timeSlots.days");
  const lessonBySlot = new Map(lessons.map((l) => [l.slotId, l]));

  return (
    <section
      data-print-sheet
      className="flex h-[190mm] w-[277mm] shrink-0 flex-col gap-3 bg-card p-[6mm] text-card-foreground shadow-md [print-color-adjust:exact] print:h-[188mm] print:p-0 print:shadow-none print:[&+&]:break-before-page"
      aria-label={t(view, { name })}
    >
      <header className="flex items-center justify-between gap-6 border-b pb-2">
        <div className="flex min-w-0 items-center gap-2">
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logos come from Supabase Storage
            <img src={school.logoUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- static SVG
            <img src="/brand/tasyir-icon.svg" alt="" className="size-10 shrink-0 rounded-lg" />
          )}
          <span className="truncate text-lg font-semibold" dir="auto">
            {school.name}
          </span>
        </div>
        <h2 className="text-center text-2xl font-semibold">
          {t("sheetTitle")} · <bdi>{t(view, { name })}</bdi>
        </h2>
        <span className="shrink-0 text-lg">{t("year", { year: ltr(yearLabel) })}</span>
      </header>

      <table className="h-full w-full flex-1 table-fixed border-collapse text-sm">
        <thead>
          <tr className="h-[7mm]">
            <th scope="col" className="w-[24mm] border bg-muted px-1 text-xs font-medium">
              {tGrid("time")}
            </th>
            {days.map((day) => (
              <th key={day} scope="col" className="border bg-muted px-2 font-semibold">
                {tDays(DAY_KEYS[day])}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weekRows(days, slots).map((row) => (
            <tr key={row.key} className={row.isBreak ? "h-[5mm]" : undefined}>
              <th scope="row" className="border px-1 text-xs font-normal text-muted-foreground">
                <TimeRange start={row.start} end={row.end} />
              </th>
              {days.map((day) => {
                const slot = row.cells.get(day);
                if (!slot) return <td key={day} className="border bg-muted/40" />;
                if (slot.kind === "break") {
                  return (
                    <td key={day} className="border bg-muted text-center text-xs text-muted-foreground">
                      {slot.label ?? tGrid("break")}
                    </td>
                  );
                }
                const lesson = lessonBySlot.get(slot.id);
                return (
                  <td key={day} className="border px-2 py-1 align-middle">
                    {lesson && <LessonCard lesson={lesson} details={details} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="flex items-end justify-between gap-6 text-sm">
        <WeeklyHours lessons={lessons} slots={slots} />
        <span className="shrink-0 text-xs text-muted-foreground">{BRAND.product}</span>
      </footer>
    </section>
  );
}
