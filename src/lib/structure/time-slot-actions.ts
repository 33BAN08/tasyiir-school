"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { getSchoolActor } from "@/lib/auth/school-actor";
import { auditStructure, parseInput, type StructureActionResult } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { SCHOOL_DAYS, TIME_SLOT_TEMPLATE } from "@/lib/structure/time-slot-template";
import { createClient } from "@/lib/supabase/server";
import {
  schoolDaySchema,
  schoolDaysSchema,
  structureIdSchema,
  timeSlotSchema,
  type TimeSlotFormValues,
} from "@/lib/validations/structure";

// School days and time slots of an academic year (structure.manage), written
// through RLS with the caller's session. Error keys: `setup.errors`.

type SlotField = keyof TimeSlotFormValues;

const SLOT_CONSTRAINTS = {
  time_slots_no_overlap: "slotOverlap",
  time_slots_day_fkey: "dayNotSchoolDay",
  time_slots_year_fkey: "notFound",
  time_slots_order_check: "slotEndBeforeStart",
  time_slots_length_check: "slotTooLong",
  time_slots_label_check: "tooLong",
};
const FIELD_OF: Record<string, SlotField> = {
  slotOverlap: "startTime",
  slotEndBeforeStart: "endTime",
  slotTooLong: "endTime",
  tooLong: "label",
};

function failure(key: string): { ok: false; error: string; field?: SlotField } {
  return { ok: false, error: key, field: FIELD_OF[key] };
}

const localeSchema = z.enum(routing.locales);

/** Switches a week day on or off for a year. A day that still has slots stays on. */
export async function setSchoolDay(
  yearId: unknown,
  day: unknown,
  on: unknown,
): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const year = structureIdSchema.safeParse(yearId);
  const d = schoolDaySchema.safeParse(day);
  const enable = z.boolean().safeParse(on);
  if (!year.success || !d.success || !enable.success) return { ok: false, error: "generic" };

  const supabase = await createClient();
  if (enable.data) {
    const { error } = await supabase
      .from("school_days")
      .upsert(
        { school_id: actor.schoolId, academic_year_id: year.data, day_of_week: d.data },
        { onConflict: "school_id,academic_year_id,day_of_week", ignoreDuplicates: true },
      );
    if (error) return { ok: false, error: dbErrorKey(error, { school_days_year_fkey: "notFound" }) };
  } else {
    const { error } = await supabase
      .from("school_days")
      .delete()
      .eq("school_id", actor.schoolId)
      .eq("academic_year_id", year.data)
      .eq("day_of_week", d.data);
    if (error) return { ok: false, error: dbErrorKey(error, { time_slots_day_fkey: "dayHasSlots" }) };
  }

  await auditStructure(actor, enable.data ? "school_day.add" : "school_day.remove", "academic_year", year.data, {
    day: d.data,
  });
  return { ok: true, data: null };
}

export async function createTimeSlot(
  yearId: unknown,
  day: unknown,
  input: unknown,
): Promise<StructureActionResult<{ id: string }, SlotField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const year = structureIdSchema.safeParse(yearId);
  const d = schoolDaySchema.safeParse(day);
  if (!year.success || !d.success) return { ok: false, error: "generic" };
  const v = parseInput<typeof timeSlotSchema, SlotField>(timeSlotSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("time_slots")
    .insert({
      school_id: actor.schoolId,
      academic_year_id: year.data,
      day_of_week: d.data,
      start_time: v.values.startTime,
      end_time: v.values.endTime,
      kind: v.values.kind,
      label: v.values.label || null,
    })
    .select("id")
    .single();
  if (error) return failure(dbErrorKey(error, SLOT_CONSTRAINTS));

  await auditStructure(actor, "time_slot.create", "time_slot", data.id, {
    day: d.data,
    start: v.values.startTime,
    end: v.values.endTime,
  });
  return { ok: true, data: { id: data.id } };
}

/** Times, kind and label; the day of a slot does not change. */
export async function updateTimeSlot(slotId: unknown, input: unknown): Promise<StructureActionResult<null, SlotField>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(slotId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof timeSlotSchema, SlotField>(timeSlotSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const { data, error } = await (await createClient())
    .from("time_slots")
    .update({
      start_time: v.values.startTime,
      end_time: v.values.endTime,
      kind: v.values.kind,
      label: v.values.label || null,
    })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return failure(dbErrorKey(error, SLOT_CONSTRAINTS));
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "time_slot.update", "time_slot", id.data, {
    start: v.values.startTime,
    end: v.values.endTime,
  });
  return { ok: true, data: null };
}

export async function deleteTimeSlot(slotId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = structureIdSchema.safeParse(slotId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("time_slots")
    .delete()
    .eq("id", id.data)
    .eq("school_id", actor.schoolId)
    .select("start_time");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "time_slot.delete", "time_slot", id.data, { start: data[0].start_time });
  return { ok: true, data: null };
}

type NewSlot = { day: number; start: string; end: string; kind: string; label: string | null };

/**
 * Adds `days` as school days, then inserts `slots` in one statement (all or
 * nothing). Refused when one of those days already has slots.
 */
async function fillDays(
  schoolId: string,
  yearId: string,
  days: number[],
  slots: NewSlot[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { count, error: readError } = await supabase
    .from("time_slots")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId)
    .in("day_of_week", days);
  if (readError) return { ok: false, error: dbErrorKey(readError) };
  if (count) return { ok: false, error: "slotsAlreadyExist" };

  const { error: daysError } = await supabase.from("school_days").upsert(
    days.map((day) => ({ school_id: schoolId, academic_year_id: yearId, day_of_week: day })),
    { onConflict: "school_id,academic_year_id,day_of_week", ignoreDuplicates: true },
  );
  if (daysError) return { ok: false, error: dbErrorKey(daysError, { school_days_year_fkey: "notFound" }) };

  if (slots.length > 0) {
    const { error } = await supabase.from("time_slots").insert(
      slots.map((s) => ({
        school_id: schoolId,
        academic_year_id: yearId,
        day_of_week: s.day,
        start_time: s.start,
        end_time: s.end,
        kind: s.kind,
        label: s.label,
      })),
    );
    if (error) return { ok: false, error: dbErrorKey(error, SLOT_CONSTRAINTS) };
  }
  return { ok: true };
}

/** Copies one day's slots to other days of the same year (days without slots only). */
export async function copyDaySlots(
  yearId: unknown,
  fromDay: unknown,
  toDays: unknown,
): Promise<StructureActionResult<{ created: number }>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const year = structureIdSchema.safeParse(yearId);
  const from = schoolDaySchema.safeParse(fromDay);
  const to = schoolDaysSchema.safeParse(toDays);
  if (!year.success || !from.success || !to.success) return { ok: false, error: "generic" };
  const targets = [...new Set(to.data)].filter((d) => d !== from.data);
  if (targets.length === 0) return { ok: false, error: "generic" };

  const { data: source, error } = await (await createClient())
    .from("time_slots")
    .select("start_time, end_time, kind, label")
    .eq("school_id", actor.schoolId)
    .eq("academic_year_id", year.data)
    .eq("day_of_week", from.data);
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (source.length === 0) return { ok: false, error: "nothingToCopy" };

  const slots = targets.flatMap((day) =>
    source.map((s) => ({ day, start: s.start_time, end: s.end_time, kind: s.kind, label: s.label })),
  );
  const result = await fillDays(actor.schoolId, year.data, targets, slots);
  if (!result.ok) return result;

  await auditStructure(actor, "time_slot.copy_day", "academic_year", year.data, {
    from: from.data,
    to: targets.join(","),
  });
  return { ok: true, data: { created: slots.length } };
}

/** Fills an empty year with the typical Moroccan week; break labels in the UI language. */
export async function applyTimeSlotTemplate(
  yearId: unknown,
  locale: unknown,
): Promise<StructureActionResult<{ created: number }>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const year = structureIdSchema.safeParse(yearId);
  const lang = localeSchema.safeParse(locale);
  if (!year.success || !lang.success) return { ok: false, error: "generic" };

  const t = await getTranslations({ locale: lang.data, namespace: "setup.timeSlots.template.labels" });
  const slots = SCHOOL_DAYS.flatMap((day) =>
    TIME_SLOT_TEMPLATE[day].map((s) => ({
      day,
      start: s.start,
      end: s.end,
      kind: s.kind,
      label: s.label ? t(s.label) : null,
    })),
  );
  const result = await fillDays(actor.schoolId, year.data, [...SCHOOL_DAYS], slots);
  if (!result.ok) return result;

  await auditStructure(actor, "time_slot.template", "academic_year", year.data, { slots: slots.length });
  return { ok: true, data: { created: slots.length } };
}

/** Copies another year's days and slots into an empty year (database function, all or nothing). */
export async function copyTimeSlotsFromYear(
  fromYearId: unknown,
  toYearId: unknown,
): Promise<StructureActionResult<{ created: number }>> {
  const actor = await getSchoolActor("structure.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const from = structureIdSchema.safeParse(fromYearId);
  const to = structureIdSchema.safeParse(toYearId);
  if (!from.success || !to.success) return { ok: false, error: "notFound" };
  if (from.data === to.data) return { ok: false, error: "generic" };

  const { data, error } = await (await createClient()).rpc("copy_time_slots", {
    p_from_year: from.data,
    p_to_year: to.data,
  });
  if (error) {
    return {
      ok: false,
      error: dbErrorKey(error, {
        copy_time_slots_target_not_empty: "slotsAlreadyExist",
        copy_time_slots_year_not_found: "notFound",
        ...SLOT_CONSTRAINTS,
      }),
    };
  }
  await auditStructure(actor, "time_slot.copy_year", "academic_year", to.data, { from: from.data, slots: data });
  return { ok: true, data: { created: data } };
}
