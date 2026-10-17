// Double bookings (client + server): which lesson of a slot a booking would
// clash with. The same rule as the database's unique keys, checked first so
// the UI and the Server Actions can say who is busy.

type Seat = { classId: string; teacherId: string; roomId: string | null };
export type ClashKind = "class" | "teacher" | "room";

/**
 * The first lesson of `atSlot` that `seat` clashes with — same class, then same
 * teacher, then same room (no room never clashes) — leaving out `ignore`.
 */
export function findClash<T extends Seat & { id: string }>(
  seat: Seat,
  atSlot: T[],
  ignore: string[] = [],
): { kind: ClashKind; lesson: T } | null {
  const others = atSlot.filter((l) => !ignore.includes(l.id));
  const sameClass = others.find((l) => l.classId === seat.classId);
  if (sameClass) return { kind: "class", lesson: sameClass };
  const sameTeacher = others.find((l) => l.teacherId === seat.teacherId);
  if (sameTeacher) return { kind: "teacher", lesson: sameTeacher };
  const sameRoom = seat.roomId ? others.find((l) => l.roomId === seat.roomId) : undefined;
  if (sameRoom) return { kind: "room", lesson: sameRoom };
  return null;
}
