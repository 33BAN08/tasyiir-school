// Phase 4 step 5: school days and time slots (database level), per academic
// year. Writes through RLS with the user's session: own school +
// structure.manage. A slot is on one of its year's school days, slots of a
// day never overlap, and copy_time_slots() copies a year into an empty one.
import { allowed, check, denied, rows } from "./checks.mjs";

export async function phase4TimeSlots({ fx, as }) {
  const A = fx.schools.a;
  const B = fx.schools.b;
  const C = fx.schools.c;
  const { anon, dirA, survA, dirB, dirC, owner } = as;

  const one = async (query, what) => {
    const { data, error } = await query.select("id").single();
    if (error) throw new Error(`phase4TimeSlots setup: ${what} (${error.code})`);
    return data.id;
  };
  const refusedWith = async (label, query, code) => {
    const { error } = await query;
    check(`[P4] ${label}`, error?.code === code, error ? error.code : "ACCEPTED!");
  };

  // Far-future years so they never overlap the other suites' years.
  const yearOf = (schoolId, start) => ({
    school_id: schoolId,
    label: `${start}-${start + 1}`,
    start_date: `${start}-09-01`,
    end_date: `${start + 1}-06-30`,
  });
  const yearA = await one(dirA.from("academic_years").insert(yearOf(A.id, 2060)), "year A");
  const nextA = await one(dirA.from("academic_years").insert(yearOf(A.id, 2061)), "next year A");
  const yearB = await one(dirB.from("academic_years").insert(yearOf(B.id, 2060)), "year B");

  // --- School days ----------------------------------------------------------------
  const day = (schoolId, yearId, d) => ({ school_id: schoolId, academic_year_id: yearId, day_of_week: d });
  const insertDay = (client, values) => client.from("school_days").insert(values).select("day_of_week");

  await allowed("[P4] director adds Monday as a school day", insertDay(dirA, day(A.id, yearA, 1)));
  await allowed("[P4] …and Saturday", insertDay(dirA, day(A.id, yearA, 6)));
  await denied("[P4] director A cannot add a day in school B", insertDay(dirA, day(B.id, yearB, 1)));
  await refusedWith("a day cannot point at another school's year",
    insertDay(dirA, day(A.id, yearB, 2)), "23503");
  await denied("[P4] surveillant cannot add a school day", insertDay(survA, day(A.id, yearA, 2)));
  await denied("[P4] suspended school's director cannot add a day", insertDay(dirC, day(C.id, yearA, 2)));
  await denied("[P4] platform owner cannot write school days", insertDay(owner, day(A.id, yearA, 2)));
  await denied("[P4] anonymous cannot add a school day", insertDay(anon, day(A.id, yearA, 2)));
  await refusedWith("Sunday is not a school day", insertDay(dirA, day(A.id, yearA, 7)), "23514");
  await refusedWith("a day is added once", insertDay(dirA, day(A.id, yearA, 1)), "23505");
  await denied("[P4] school days cannot be updated (no UPDATE grant)",
    dirA.from("school_days").update({ day_of_week: 2 }).eq("academic_year_id", yearA).select("day_of_week"));

  // --- Time slots -----------------------------------------------------------------
  const slot = (start, end, extra = {}) => ({
    school_id: A.id,
    academic_year_id: yearA,
    day_of_week: 1,
    start_time: start,
    end_time: end,
    ...extra,
  });
  const insertSlot = (client, values) => client.from("time_slots").insert(values).select("id");

  const first = await one(dirA.from("time_slots").insert(slot("08:00", "09:00")), "first slot");
  await allowed("[P4] back-to-back slots are fine", insertSlot(dirA, slot("09:00", "10:00")));
  await allowed("[P4] a break with a label",
    insertSlot(dirA, slot("10:00", "10:15", { kind: "break", label: "Récréation" })));
  await refusedWith("overlapping slots of the same day are refused",
    insertSlot(dirA, slot("08:30", "09:30")), "23P01");
  await allowed("[P4] the same times on another school day", insertSlot(dirA, slot("08:00", "09:00", { day_of_week: 6 })));
  await refusedWith("a slot on a day that is not a school day is refused",
    insertSlot(dirA, slot("08:00", "09:00", { day_of_week: 2 })), "23503");
  await refusedWith("the end must be after the start", insertSlot(dirA, slot("11:00", "10:30")), "23514");
  await refusedWith("a slot lasts at most 4 hours", insertSlot(dirA, slot("12:00", "16:30")), "23514");
  await refusedWith("times are whole minutes", insertSlot(dirA, slot("12:00:30", "13:00")), "23514");
  await refusedWith("an untrimmed label is refused", insertSlot(dirA, slot("12:00", "13:00", { label: " x" })), "23514");
  await refusedWith("an unknown kind is refused", insertSlot(dirA, slot("12:00", "13:00", { kind: "nap" })), "23514");
  await denied("[P4] director A cannot create a slot in school B",
    insertSlot(dirA, { ...slot("08:00", "09:00"), school_id: B.id, academic_year_id: yearB }));
  await denied("[P4] surveillant cannot create a slot", insertSlot(survA, slot("12:00", "13:00")));
  await denied("[P4] platform owner cannot write slots", insertSlot(owner, slot("12:00", "13:00")));

  await rows("[P4] surveillant reads own school's slots",
    survA.from("time_slots").select("id").eq("academic_year_id", yearA), 4);
  await rows("[P4] director B sees no slot of school A", dirB.from("time_slots").select("id").eq("school_id", A.id), 0);
  await rows("[P4] director B sees no school day of school A",
    dirB.from("school_days").select("day_of_week").eq("school_id", A.id), 0);
  await allowed("[P4] director edits own slot",
    dirA.from("time_slots").update({ end_time: "08:55", label: "Accueil" }).eq("id", first).select("id"));
  await refusedWith("a slot cannot move to another school's year",
    dirA.from("time_slots").update({ academic_year_id: yearB }).eq("id", first).select("id"), "23503");
  await denied("[P4] director B cannot edit school A's slot",
    dirB.from("time_slots").update({ label: "x" }).eq("id", first).select("id"));
  await denied("[P4] director B cannot delete school A's slot",
    dirB.from("time_slots").delete().eq("id", first).select("id"));
  await refusedWith("a school day that has slots cannot be removed",
    dirA.from("school_days").delete().eq("academic_year_id", yearA).eq("day_of_week", 1), "23503");

  // --- Per year + copy_time_slots -------------------------------------------------
  await allowed("[P4] next year can have the same day and times",
    insertDay(dirA, day(A.id, nextA, 1)));
  await allowed("[P4] …the same slot in another year does not overlap",
    insertSlot(dirA, { ...slot("08:00", "09:00"), academic_year_id: nextA }));
  const copy = (client, from, to) => client.rpc("copy_time_slots", { p_from_year: from, p_to_year: to });

  const intoFull = await copy(dirA, yearA, nextA);
  check("[P4] copy into a year that has slots is refused",
    intoFull.error?.message === "copy_time_slots_target_not_empty", intoFull.error?.message ?? "ACCEPTED!");
  await dirA.from("time_slots").delete().eq("academic_year_id", nextA);
  const same = await copy(dirA, yearA, yearA);
  check("[P4] copy into the same year is refused",
    same.error?.message === "copy_time_slots_same_year", same.error?.message ?? "ACCEPTED!");
  const bySurv = await copy(survA, yearA, nextA);
  check("[P4] surveillant cannot copy slots", Boolean(bySurv.error), bySurv.error?.code ?? "ACCEPTED!");
  const fromB = await copy(dirB, yearA, nextA);
  check("[P4] director B cannot copy into school A's year",
    fromB.error?.message === "copy_time_slots_year_not_found", fromB.error?.message ?? "ACCEPTED!");
  const stealing = await copy(dirB, yearA, yearB);
  check("[P4] director B copying school A's year gets nothing", stealing.data === 0, JSON.stringify(stealing));
  await rows("[P4] …and school B's year stays empty", dirB.from("time_slots").select("id").eq("academic_year_id", yearB), 0);

  const copied = await copy(dirA, yearA, nextA);
  check("[P4] director copies a year into an empty year", copied.data === 4, JSON.stringify(copied));
  await rows("[P4] …with its days (Monday + Saturday)",
    dirA.from("school_days").select("day_of_week").eq("academic_year_id", nextA), 2);
  await rows("[P4] …labels and kinds kept",
    dirA.from("time_slots").select("id").eq("academic_year_id", nextA).eq("kind", "break").eq("label", "Récréation"), 1);

  await allowed("[P4] deleting a year removes its days and slots",
    dirA.from("academic_years").delete().eq("id", nextA).select("id"));
  await rows("[P4] …nothing left of that year", dirA.from("time_slots").select("id").eq("academic_year_id", nextA), 0);

  // Leave nothing for the next suites (slots and days go with their years).
  await dirA.from("academic_years").delete().eq("id", yearA);
  await dirB.from("academic_years").delete().eq("id", yearB);
}
