// Unit checks of src/lib/timetable/clash.ts (loaded with Node's type
// stripping): the double-booking rule shared by the drag & drop preview and
// the lesson Server Actions.
import { check } from "./checks.mjs";

const { findClash } = await import("../../src/lib/timetable/clash.ts");

const lesson = (id, classId, teacherId, roomId = null) => ({ id, classId, teacherId, roomId });
const atSlot = [lesson("L1", "c1", "t1", "r1"), lesson("L2", "c2", "t2", null)];
const expect = (name, clash, wanted) => {
  const got = clash ? `${clash.kind}:${clash.lesson.id}` : null;
  check(`[P6 rule] ${name}`, got === wanted, got ?? "free");
};

expect("free class, teacher and room", findClash(lesson("X", "c3", "t3", "r3"), atSlot), null);
expect("same class → class", findClash(lesson("X", "c1", "t3"), atSlot), "class:L1");
expect("same teacher → teacher", findClash(lesson("X", "c3", "t2"), atSlot), "teacher:L2");
expect("same room → room", findClash(lesson("X", "c3", "t3", "r1"), atSlot), "room:L1");
expect("no room never clashes with no room", findClash(lesson("X", "c3", "t3", null), atSlot), null);
expect("class is reported before teacher", findClash(lesson("X", "c1", "t2"), atSlot), "class:L1");
expect("a lesson leaving the slot is ignored (swap partner)", findClash(lesson("X", "c1", "t1", "r1"), atSlot, ["L1"]), null);
expect("…but not the others", findClash(lesson("X", "c2", "t1"), atSlot, ["L1"]), "class:L2");
