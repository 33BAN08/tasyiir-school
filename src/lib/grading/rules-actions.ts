"use server";

import { getSchoolActor } from "@/lib/auth/school-actor";
import { auditStructure, parseInput, type StructureActionResult } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { gradingIdSchema, levelRulesSchema, type LevelRulesValues } from "@/lib/validations/grading";

// Rules per level and year (grades.manage): scale, number of contrôles,
// activités intégrées, and how averages are computed (activités weight,
// absent = 0, rounding, ties). No row = the defaults, so "reset" deletes the row.
// Error keys: `grading.errors`.

type RulesField = keyof LevelRulesValues;

const RULES_ERRORS = {
  grade_level_settings_scale_check: "scaleInvalid",
  grade_level_settings_controls_check: "controlsRange",
  grade_level_settings_activities_weight_check: "activitiesWeightRange",
};

export async function saveLevelRules(
  yearId: unknown,
  levelId: unknown,
  input: unknown,
): Promise<StructureActionResult<null, RulesField>> {
  const actor = await getSchoolActor("grades.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const year = gradingIdSchema.safeParse(yearId);
  const level = gradingIdSchema.safeParse(levelId);
  if (!year.success || !level.success) return { ok: false, error: "notFound" };
  const v = parseInput<typeof levelRulesSchema, RulesField>(levelRulesSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const values = {
    scale: v.values.scale,
    controls_count: v.values.controlsCount,
    activities: v.values.activities,
    ...(v.values.activitiesWeight !== undefined && { activities_weight: v.values.activitiesWeight }),
    ...(v.values.absentAsZero !== undefined && { absent_as_zero: v.values.absentAsZero }),
    ...(v.values.rounding !== undefined && { rounding: v.values.rounding }),
    ...(v.values.ranking !== undefined && { ranking: v.values.ranking }),
  };
  const supabase = await createClient();
  // Update first (the key columns are not updatable, so no upsert), else insert.
  const update = () =>
    supabase
      .from("grade_level_settings")
      .update(values)
      .eq("school_id", actor.schoolId)
      .eq("academic_year_id", year.data)
      .eq("level_id", level.data)
      .select("level_id");
  let result = await update();
  if (!result.error && result.data.length === 0) {
    const inserted = await supabase
      .from("grade_level_settings")
      .insert({ school_id: actor.schoolId, academic_year_id: year.data, level_id: level.data, ...values })
      .select("level_id");
    // Someone saved the same level meanwhile: theirs exists now, write over it.
    result = inserted.error?.code === "23505" ? await update() : inserted;
  }
  if (result.error) return { ok: false, error: dbErrorKey(result.error, RULES_ERRORS) };
  if (result.data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "grading.rules.save", "level", level.data, {
    year: year.data,
    scale: v.values.scale,
    controls: v.values.controlsCount,
    activities: v.values.activities,
    activitiesWeight: v.values.activitiesWeight ?? null,
    absentAsZero: v.values.absentAsZero ?? null,
    rounding: v.values.rounding ?? null,
    ranking: v.values.ranking ?? null,
  });
  return { ok: true, data: null };
}

/** Back to the defaults (/10 primaire, else /20; 4 contrôles; no activités; activités = 1 contrôle, absent left out, rounded, ties shared). */
export async function resetLevelRules(yearId: unknown, levelId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("grades.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const year = gradingIdSchema.safeParse(yearId);
  const level = gradingIdSchema.safeParse(levelId);
  if (!year.success || !level.success) return { ok: false, error: "notFound" };

  const { error } = await (await createClient())
    .from("grade_level_settings")
    .delete()
    .eq("school_id", actor.schoolId)
    .eq("academic_year_id", year.data)
    .eq("level_id", level.data);
  if (error) return { ok: false, error: dbErrorKey(error) };

  await auditStructure(actor, "grading.rules.reset", "level", level.data, { year: year.data });
  return { ok: true, data: null };
}
