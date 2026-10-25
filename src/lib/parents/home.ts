import "server-only";

import { listAnnouncements } from "@/lib/announcements/queries";
import type { SchoolClock } from "@/lib/attendance/clock";
import { periodRange } from "@/lib/attendance/periods";
import { yearOf } from "@/lib/attendance/staff";
import { getChildAbsences } from "@/lib/justifications/parent";
import { listStudentRemarks } from "@/lib/remarks/queries";
import type { RemarkType } from "@/lib/validations/remarks";
import { listAcademicYears } from "@/lib/structure/academic-years";
import { getSchoolWeek } from "@/lib/structure/time-slots";
import { createClient } from "@/lib/supabase/server";
import { nowAndNext } from "@/lib/timetable/now";
import { getYearTimetable } from "@/lib/timetable/timetable";

import type { MyChild } from "./portal";

// The parent home (/portal): what the tiles and cards show for the selected
// child, all from existing reads with the PARENT's own session (RLS: their
// children, their announcements and notifications, their guardian row).
// Nothing here is invented: a part with no data is null and hidden.

export type ParentHome = {
  /** The absence to justify first (most recent absence not justified, not pending), or null. */
  toJustify: { date: string; start: string; subjectName: string } | null;
  /** Absences (not lates) of the current calendar month. */
  monthAbsences: number;
  remarks: { unread: number; latestType: RemarkType | null };
  announcements: { unread: number; latest: { id: string; title: string; body: string; unread: boolean } | null };
  /** The lesson going on, or the next one of the child's week; null without a timetable. */
  lesson: { now: boolean; day: number; start: string; subjectName: string } | null;
};

/** The parent's own first name (their guardian row), else null (the page falls back to the account name). */
export async function getParentFirstName(userId: string): Promise<string | null> {
  const { data } = await (await createClient())
    .from("guardians")
    .select("first_name")
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.first_name ?? null;
}

export async function getParentHome(schoolId: string, userId: string, child: MyChild, clock: SchoolClock): Promise<ParentHome> {
  const supabase = await createClient();
  const years = await listAcademicYears(schoolId);
  const year = yearOf(years, clock.date) ?? years[0];

  const [absences, remarks, announcements, unreadNotes, lesson] = await Promise.all([
    year ? getChildAbsences(schoolId, child.id, periodRange("year", clock.date, year).from, clock.date) : null,
    child.classId ? listStudentRemarks(child.id) : Promise.resolve([]),
    listAnnouncements(),
    supabase.from("notifications").select("data").eq("recipient_id", userId).eq("type", "announcement").is("read_at", null),
    // The timetable is the current year's (as on the child's timetable page).
    nextLesson(schoolId, child, clock, years.find((y) => y.isCurrent)?.id ?? null),
  ]);

  const absent = (absences?.marks ?? []).filter((m) => m.status === "absent");
  const monthStart = `${clock.date.slice(0, 8)}01`;
  const toJustify = absent.find((m) => m.state === "none" || m.state === "rejected") ?? null;
  const unreadIds = new Set(
    (unreadNotes.data ?? []).flatMap((n) => {
      const id = (n.data as { announcement_id?: unknown } | null)?.announcement_id;
      return typeof id === "string" ? [id] : [];
    }),
  );
  const latest = announcements[0] ?? null;

  return {
    toJustify: toJustify ? { date: toJustify.date, start: toJustify.start, subjectName: toJustify.subjectName } : null,
    monthAbsences: absent.filter((m) => m.date >= monthStart).length,
    remarks: { unread: remarks.filter((r) => !r.readAt).length, latestType: remarks[0]?.type ?? null },
    announcements: {
      unread: unreadIds.size,
      latest: latest ? { id: latest.id, title: latest.title, body: latest.body, unread: unreadIds.has(latest.id) } : null,
    },
    lesson,
  };
}

/** Same rule as the child's timetable page ("En cours" / "Ensuite"), with the school's clock from the database. */
async function nextLesson(schoolId: string, child: MyChild, clock: SchoolClock, yearId: string | null): Promise<ParentHome["lesson"]> {
  if (!child.classId || !yearId) return null;
  const [week, timetable] = await Promise.all([getSchoolWeek(schoolId, yearId), getYearTimetable(schoolId, yearId)]);
  const lessons = timetable.lessons.filter((l) => l.classId === child.classId);
  if (lessons.length === 0) return null;
  const { current, next } = nowAndNext(lessons, new Map(week.slots.map((s) => [s.id, s])), { day: clock.weekday, time: clock.time });
  const pick = current ?? next;
  return pick ? { now: !!current, day: pick.slot.day, start: pick.slot.startTime, subjectName: pick.lesson.subjectName } : null;
}
