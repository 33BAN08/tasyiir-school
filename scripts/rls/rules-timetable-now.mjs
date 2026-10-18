// Unit checks of src/lib/timetable/now.ts (the lesson going on and the next
// one, as the teacher's and parents' timetables highlight them). Clocks are
// given explicitly: what "now" is in Casablanca depends on the device's
// time-zone data (Morocco is UTC+0 from 2026-09-20, IANA tzdata 2026c).
import { check } from "./checks.mjs";

const { nowAndNext, schoolClock } = await import("../../src/lib/timetable/now.ts");

const slot = (id, day, startTime, endTime) => ({ id, day, startTime, endTime, kind: "lesson", label: null });
const slots = [slot("mon8", 1, "08:00", "09:00"), slot("mon9", 1, "09:00", "10:00"), slot("tue8", 2, "08:00", "09:00"), slot("wed8", 3, "08:00", "09:00")];
const slotById = new Map(slots.map((s) => [s.id, s]));
const lesson = (id, slotId) => ({ id, slotId });
const lessons = [lesson("A", "mon8"), lesson("B", "mon9"), lesson("C", "tue8")];

function expect(name, clock, current, next, list = lessons) {
  const got = nowAndNext(list, slotById, clock);
  const text = `${got.current?.lesson.id ?? "-"}/${got.next?.lesson.id ?? "-"}`;
  check(`[P6 now] ${name}`, text === `${current}/${next}`, text);
}

expect("during the first lesson: now A, next B", { day: 1, time: "08:20" }, "A", "B");
expect("at a lesson's start minute it is going on", { day: 1, time: "09:00" }, "B", "C");
expect("at its end minute it is over", { day: 1, time: "10:00" }, "-", "C");
expect("before school: nothing now, next is the first lesson", { day: 1, time: "07:30" }, "-", "A");
expect("a free slot (Wednesday 08:00 has no lesson)", { day: 3, time: "08:30" }, "-", "A");
expect("after the last lesson of the week → next Monday's first", { day: 6, time: "11:00" }, "-", "A");
expect("Sunday → Monday's first", { day: 7, time: "10:00" }, "-", "A");
expect("one lesson a week, going on: no 'next' (it would be itself)", { day: 1, time: "08:30" }, "A", "-", [lesson("A", "mon8")]);
expect("no lessons: nothing", { day: 1, time: "08:30" }, "-", "-", []);

// The clock itself, at an instant whose offset all tzdata versions agree on (UTC+1 in July 2026).
const july = schoolClock(new Date("2026-07-01T08:20:00Z"));
check("[P6 now] schoolClock: Wednesday 1 July 2026, 08:20 UTC → day 3, 09:20", july.day === 3 && july.time === "09:20", JSON.stringify(july));
