// Timetable shapes shared by the server reads and the client grid.

import type { SubjectColor } from "@/lib/structure/subject-template";

export type TimetableLesson = {
  id: string;
  slotId: string;
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  subjectColor: SubjectColor;
  teacherId: string;
  teacherName: string;
  roomId: string | null;
  roomName: string | null;
};

/** A teacher as a timetable may show them: name only (no email, no phone). */
export type TimetableTeacher = { id: string; name: string; active: boolean; subjectIds: string[] };

export type TimetableOption = { id: string; name: string };
export type TimetableSubject = TimetableOption & { color: SubjectColor };

/** A refused booking, explained: who or what is already busy, where, when. */
export type LessonConflict = {
  /** "teacher" | "room" | "class" */
  kind: "teacher" | "room" | "class";
  /** The busy teacher's or room's name (empty for a class). */
  name: string;
  /** The class that already has the slot. */
  className: string;
  day: number;
  start: string;
  end: string;
};
