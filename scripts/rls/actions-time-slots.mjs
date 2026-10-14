// Phase 4 step 5 Server Actions (school days, time slots, copy a day, the
// typical Moroccan week, copy from another year), called over HTTP as real
// users on the page that registers them.
import { actionId, callAction, sessionCookies } from "./app.mjs";
import { check } from "./checks.mjs";
import { admin } from "./fixtures.mjs";

const FILE = "src/lib/structure/time-slot-actions.ts";
const PAGE = "/fr/setup/time-slots";
const NAMES = [
  "setSchoolDay",
  "createTimeSlot",
  "updateTimeSlot",
  "deleteTimeSlot",
  "copyDaySlots",
  "applyTimeSlotTemplate",
  "copyTimeSlotsFromYear",
];

export async function timeSlotActions({ fx, baseUrl }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const ids = Object.fromEntries(NAMES.map((n) => [n, { id: actionId(FILE, n), path: PAGE }]));
  const cookies = {};
  for (const name of ["dirA", "survA", "dirB"]) cookies[name] = await sessionCookies(fx.users[name]);

  const call = (who, action, ...args) => callAction(baseUrl, { ...ids[action], args, cookies: cookies[who] });
  const expect = async (label, promise, wanted) => {
    const r = await promise;
    const got = r.ok ? "ok" : r.error;
    check(`[P4 action] ${label}`, got === wanted, got);
    return r;
  };

  // Far-future years (admin setup) so they never overlap the other suites' years.
  const year = async (schoolId, start) => {
    const { data, error } = await admin
      .from("academic_years")
      .insert({ school_id: schoolId, label: `${start}-${start + 1}`, start_date: `${start}-09-01`, end_date: `${start + 1}-06-30` })
      .select("id")
      .single();
    if (error) throw new Error(`timeSlotActions setup: year ${start} (${error.code})`);
    return data.id;
  };
  const yearA = await year(A.id, 2062);
  const templateA = await year(A.id, 2063);
  const emptyA = await year(A.id, 2064);
  const yearB = await year(B.id, 2062);
  const slotsOf = async (yearId) =>
    (await admin.from("time_slots").select("id, day_of_week, start_time, end_time, kind, label").eq("academic_year_id", yearId))
      .data ?? [];
  const lesson = (startTime, endTime, label = "") => ({ startTime, endTime, kind: "lesson", label });

  // --- School days ----------------------------------------------------------------
  await expect("surveillant cannot switch on a day", call("survA", "setSchoolDay", yearA, 1, true), "forbidden");
  await expect("director switches on Monday", call("dirA", "setSchoolDay", yearA, 1, true), "ok");
  await expect("…switching it on again is fine", call("dirA", "setSchoolDay", yearA, 1, true), "ok");
  await expect("Sunday is refused", call("dirA", "setSchoolDay", yearA, 7, true), "generic");
  await expect("director A cannot use school B's year", call("dirA", "setSchoolDay", yearB, 1, true), "notFound");

  // --- Slots ----------------------------------------------------------------------
  const created = await expect("director adds a slot typed as 8h → 9:00",
    call("dirA", "createTimeSlot", yearA, 1, lesson("8h", "9:00")), "ok");
  const slotId = created.ok ? created.data.id : null;
  const stored = (await slotsOf(yearA))[0];
  check("[P4 action] …stored as 08:00–09:00, no label",
    stored?.start_time === "08:00:00" && stored?.end_time === "09:00:00" && stored?.label === null, JSON.stringify(stored));
  await expect("overlap → slotOverlap", call("dirA", "createTimeSlot", yearA, 1, lesson("08:30", "09:30")), "slotOverlap");
  await expect("a day that is not switched on → dayNotSchoolDay",
    call("dirA", "createTimeSlot", yearA, 2, lesson("08:00", "09:00")), "dayNotSchoolDay");
  await expect("end before start → slotEndBeforeStart",
    call("dirA", "createTimeSlot", yearA, 1, lesson("11:00", "10:00")), "slotEndBeforeStart");
  await expect("over 4 hours → slotTooLong",
    call("dirA", "createTimeSlot", yearA, 1, lesson("12:00", "16:30")), "slotTooLong");
  await expect("25:00 → invalidTime", call("dirA", "createTimeSlot", yearA, 1, lesson("25:00", "26:00")), "invalidTime");
  await expect("label over 40 characters → tooLong",
    call("dirA", "createTimeSlot", yearA, 1, lesson("12:00", "13:00", "x".repeat(41))), "tooLong");
  await expect("surveillant cannot add a slot",
    call("survA", "createTimeSlot", yearA, 1, lesson("12:00", "13:00")), "forbidden");
  await expect("director edits the slot and labels it",
    call("dirA", "updateTimeSlot", slotId, lesson("08:00", "08:55", "Accueil")), "ok");
  await expect("director B cannot edit school A's slot",
    call("dirB", "updateTimeSlot", slotId, lesson("08:00", "09:00")), "notFound");
  await expect("a day with slots cannot be switched off", call("dirA", "setSchoolDay", yearA, 1, false), "dayHasSlots");

  // --- Copy a day -----------------------------------------------------------------
  const copiedDay = await expect("director copies Monday to Tuesday and Wednesday",
    call("dirA", "copyDaySlots", yearA, 1, [2, 3]), "ok");
  check("[P4 action] …2 slots created, days switched on",
    copiedDay.ok && copiedDay.data.created === 2 &&
      (await admin.from("school_days").select("day_of_week").eq("academic_year_id", yearA)).data?.length === 3,
    JSON.stringify(copiedDay.data ?? {}));
  await expect("copying onto days that have slots → slotsAlreadyExist",
    call("dirA", "copyDaySlots", yearA, 1, [2]), "slotsAlreadyExist");
  await expect("copying an empty day → nothingToCopy", call("dirA", "copyDaySlots", yearA, 4, [5]), "nothingToCopy");

  // --- Typical Moroccan week ------------------------------------------------------
  await expect("template on a year that has slots → slotsAlreadyExist",
    call("dirA", "applyTimeSlotTemplate", yearA, "fr"), "slotsAlreadyExist");
  await expect("unknown UI language is refused", call("dirA", "applyTimeSlotTemplate", templateA, "de"), "generic");
  await expect("surveillant cannot apply the template", call("survA", "applyTimeSlotTemplate", templateA, "fr"), "forbidden");
  const template = await expect("director fills an empty year with the template (fr)",
    call("dirA", "applyTimeSlotTemplate", templateA, "fr"), "ok");
  const week = await slotsOf(templateA);
  check("[P4 action] …50 slots, Monday → Saturday",
    template.ok && template.data.created === 50 && new Set(week.map((s) => s.day_of_week)).size === 6,
    JSON.stringify(template.data ?? {}));
  check("[P4 action] …break labels in French",
    week.some((s) => s.kind === "break" && s.label === "Pause déjeuner"), "");

  // --- Copy from another year -----------------------------------------------------
  await expect("copy into a year that has slots → slotsAlreadyExist",
    call("dirA", "copyTimeSlotsFromYear", templateA, yearA), "slotsAlreadyExist");
  await expect("surveillant cannot copy a year", call("survA", "copyTimeSlotsFromYear", templateA, emptyA), "forbidden");
  await expect("director B cannot copy into school A's year",
    call("dirB", "copyTimeSlotsFromYear", templateA, emptyA), "notFound");
  const copiedYear = await expect("director copies a year into an empty year",
    call("dirA", "copyTimeSlotsFromYear", templateA, emptyA), "ok");
  check("[P4 action] …all 50 slots copied", copiedYear.ok && copiedYear.data.created === 50 && (await slotsOf(emptyA)).length === 50,
    JSON.stringify(copiedYear.data ?? {}));
  check("[P4 action] …the source year is unchanged", (await slotsOf(templateA)).length === 50, "");

  // --- Delete ---------------------------------------------------------------------
  await expect("director B cannot delete school A's slot", call("dirB", "deleteTimeSlot", slotId), "notFound");
  await expect("director deletes a slot", call("dirA", "deleteTimeSlot", slotId), "ok");

  // Leave nothing for the next suites (days and slots go with their years).
  await admin.from("academic_years").delete().in("id", [yearA, templateA, emptyA, yearB]);
}
