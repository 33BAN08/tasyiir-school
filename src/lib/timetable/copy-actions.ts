"use server";

import { logAudit } from "@/lib/audit";
import { getSchoolActor, type SchoolActor } from "@/lib/auth/school-actor";
import { dbErrorKey } from "@/lib/structure/db-errors";
import type { SubjectColor } from "@/lib/structure/subject-template";
import { shortTime } from "@/lib/structure/time-slot-template";
import { createClient } from "@/lib/supabase/server";
import { lessonIdSchema } from "@/lib/validations/timetable";

import type { Supabase } from "./lesson-checks";

// Copy a class's timetable from an earlier year into an empty class of the
// current year. The rules live in copy_class_lessons() (SECURITY INVOKER, so
// RLS applies): preview = the report only, copy = the same report and every
// copied lesson inserted in one statement. Error keys under `timetable.copy.errors`.

export type CopyStatus = "copy" | "room_busy" | "teacher_busy" | "teacher_inactive" | "teacher_subject" | "no_slot";

/** One lesson of the source class and what the copy does with it. */
export type CopyLine = {
  lessonId: string;
  status: CopyStatus;
  day: number;
  start: string;
  end: string;
  subjectName: string;
  subjectColor: SubjectColor;
  teacherName: string;
  roomName: string | null;
};

export type CopyResult = { ok: true; data: CopyLine[] } | { ok: false; error: string };

const ERRORS = {
  copy_lessons_forbidden: "forbidden",
  copy_lessons_not_found: "notFound",
  copy_lessons_target_not_current: "targetNotCurrent",
  copy_lessons_source_not_earlier: "sourceNotEarlier",
  copy_lessons_target_not_empty: "targetNotEmpty",
  lessons_class_slot_key: "changedMeanwhile",
  lessons_teacher_slot_key: "changedMeanwhile",
  lessons_room_slot_key: "changedMeanwhile",
};

async function run(fromClass: unknown, toClass: unknown, apply: boolean): Promise<{ result: CopyResult; actor?: SchoolActor }> {
  const actor = await getSchoolActor("timetable.manage");
  if (!actor) return { result: { ok: false, error: "forbidden" } };
  const from = lessonIdSchema.safeParse(fromClass);
  const to = lessonIdSchema.safeParse(toClass);
  if (!from.success || !to.success) return { result: { ok: false, error: "notFound" } };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("copy_class_lessons", {
    p_from_class: from.data,
    p_to_class: to.data,
    p_apply: apply,
  });
  if (error) return { result: { ok: false, error: dbErrorKey(error, ERRORS) } };

  const lines = await describe(supabase, actor.schoolId, from.data, data);
  return { result: lines ? { ok: true, data: lines } : { ok: false, error: "generic" }, actor };
}

/** The report with what a person reads: day, hours, subject, teacher, room. */
async function describe(
  supabase: Supabase,
  schoolId: string,
  fromClass: string,
  report: { source_lesson_id: string; status: string }[],
): Promise<CopyLine[] | null> {
  const { data: lessons, error } = await supabase
    .from("lessons")
    .select("id, academic_year_id, teacher_id, subject:subjects(name, color), room:rooms(name), slot:time_slots(day_of_week, start_time, end_time)")
    .eq("school_id", schoolId)
    .eq("class_id", fromClass);
  if (error) return null;
  const year = lessons[0]?.academic_year_id;
  const { data: teachers } = year ? await supabase.rpc("timetable_teachers", { p_year: year }) : { data: [] };
  const teacherName = new Map((teachers ?? []).map((t) => [t.id, t.full_name]));
  const byId = new Map(lessons.map((l) => [l.id, l]));

  return report.flatMap((row) => {
    const lesson = byId.get(row.source_lesson_id);
    if (!lesson?.slot || !lesson.subject) return [];
    return [{
      lessonId: lesson.id,
      status: row.status as CopyStatus,
      day: lesson.slot.day_of_week,
      start: shortTime(lesson.slot.start_time),
      end: shortTime(lesson.slot.end_time),
      subjectName: lesson.subject.name,
      subjectColor: lesson.subject.color as SubjectColor,
      teacherName: teacherName.get(lesson.teacher_id) ?? "",
      roomName: lesson.room?.name ?? null,
    }];
  });
}

/** What copying `fromClass` into `toClass` would do, lesson by lesson. Changes nothing. */
export async function previewCopy(fromClass: unknown, toClass: unknown): Promise<CopyResult> {
  return (await run(fromClass, toClass, false)).result;
}

/** Copies every lesson the preview marks as copied, all or nothing; returns what was done. */
export async function copyLessons(fromClass: unknown, toClass: unknown): Promise<CopyResult> {
  const { result, actor } = await run(fromClass, toClass, true);
  if (result.ok && actor) {
    const copied = result.data.filter((l) => l.status === "copy" || l.status === "room_busy").length;
    await logAudit({
      actorId: actor.id,
      schoolId: actor.schoolId,
      action: "lesson.copy",
      entity: "class",
      entityId: String(toClass),
      data: { from_class_id: String(fromClass), copied, skipped: result.data.length - copied },
    });
  }
  return result;
}
