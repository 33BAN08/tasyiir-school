// Whose week a timetable shows (client + server): a class's, a teacher's or a room's.
// Kept out of the "use client" files so server components get the real values.

export const TIMETABLE_VIEWS = ["class", "teacher", "room"] as const;
export type TimetableViewKind = (typeof TIMETABLE_VIEWS)[number];
