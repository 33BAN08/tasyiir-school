import "server-only";

import { listClasses } from "@/lib/structure/classes";
import { listRooms } from "@/lib/structure/rooms";
import { listSubjects } from "@/lib/structure/subjects";
import { readAll } from "@/lib/supabase/read-all";
import { createClient } from "@/lib/supabase/server";

import type { TimetableLesson, TimetableOption, TimetableSubject, TimetableTeacher } from "./types";

// Timetable reads, through RLS: lessons (timetable.view / .manage read the
// whole school), teacher names through timetable_teachers() (profiles stay
// closed), teacher_subjects (timetable.manage). The explicit school filter is
// a second fence.

export type YearTimetable = {
  lessons: TimetableLesson[];
  classes: TimetableOption[];
  subjects: TimetableSubject[];
  rooms: TimetableOption[];
  teachers: TimetableTeacher[];
};

/** Every lesson of a year with the names a grid shows, and the choices for adding one. */
export async function getYearTimetable(schoolId: string, academicYearId: string): Promise<YearTimetable> {
  const supabase = await createClient();
  const [lessons, teachers, teacherSubjects, classes, subjects, rooms] = await Promise.all([
    // A large school has more lessons than one API call returns (40 classes × 30): paged, by id.
    readAll(
      (from, to) =>
        supabase
          .from("lessons")
          .select("id, time_slot_id, class_id, subject_id, teacher_id, room_id")
          .eq("school_id", schoolId)
          .eq("academic_year_id", academicYearId)
          .order("id")
          .range(from, to),
      "getYearTimetable",
    ),
    supabase.rpc("timetable_teachers", { p_year: academicYearId }),
    // Readable with timetable.manage; empty otherwise (only needed to add lessons).
    supabase.from("teacher_subjects").select("teacher_id, subject_id").eq("school_id", schoolId),
    listClasses(schoolId, academicYearId),
    listSubjects(schoolId),
    listRooms(schoolId),
  ]);
  if (teachers.error || teacherSubjects.error) throw new Error("getYearTimetable failed");

  const subjectsOf = new Map<string, string[]>();
  for (const row of teacherSubjects.data) {
    subjectsOf.set(row.teacher_id, [...(subjectsOf.get(row.teacher_id) ?? []), row.subject_id]);
  }
  const teacherList: TimetableTeacher[] = teachers.data.map((t) => ({
    id: t.id,
    name: t.full_name,
    active: t.active,
    subjectIds: subjectsOf.get(t.id) ?? [],
  }));

  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((item) => [item.id, item]));
  const classById = byId(classes);
  const subjectById = byId(subjects);
  const roomById = byId(rooms);
  const teacherById = byId(teacherList);

  return {
    lessons: lessons.map((row) => {
      const subject = subjectById.get(row.subject_id);
      return {
        id: row.id,
        slotId: row.time_slot_id,
        classId: row.class_id,
        className: classById.get(row.class_id)?.name ?? "",
        subjectId: row.subject_id,
        subjectName: subject?.name ?? "",
        subjectColor: subject?.color ?? "slate",
        teacherId: row.teacher_id,
        teacherName: teacherById.get(row.teacher_id)?.name ?? "",
        roomId: row.room_id,
        roomName: row.room_id ? (roomById.get(row.room_id)?.name ?? "") : null,
      };
    }),
    classes: classes.map((c) => ({ id: c.id, name: c.name })),
    subjects: subjects.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    rooms: rooms.map((r) => ({ id: r.id, name: r.name })),
    teachers: teacherList,
  };
}
