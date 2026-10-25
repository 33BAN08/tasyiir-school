"use server";

import { getSchoolActor } from "@/lib/auth/school-actor";
import { auditStructure, parseInput, type StructureActionResult } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import {
  coefficientSchema,
  coefficientScopeSchema,
  gradingIdSchema,
  subjectOrderSchema,
  type CoefficientScope,
  type CoefficientValues,
} from "@/lib/validations/grading";

// Coefficients (grades.manage): one row per year + level (+ filière) + subject.
// A row = "this subject is graded here"; removing it = not graded (common
// scope) or back to the common value (filière scope). Error keys: `grading.errors`.

type CoefficientField = keyof CoefficientValues;

const COEFFICIENT_ERRORS = {
  subject_coefficients_coefficient_check: "coefficientRange",
  subject_coefficients_controls_check: "controlsRange",
  subject_coefficients_key: "coefficientExists",
};
const FIELD_OF: Record<string, CoefficientField> = { coefficientRange: "coefficient", controlsRange: "controlsCount" };

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The rows of one scope (track NULL = the level's common rows). */
function inScope<Q extends { eq: (c: string, v: string) => Q; is: (c: string, v: null) => Q }>(
  query: Q,
  schoolId: string,
  scope: CoefficientScope,
): Q {
  const q = query.eq("school_id", schoolId).eq("academic_year_id", scope.yearId).eq("level_id", scope.levelId);
  return scope.trackId ? q.eq("track_id", scope.trackId) : q.is("track_id", null);
}

async function nextPosition(supabase: Supabase, schoolId: string, scope: CoefficientScope): Promise<number> {
  const { data } = await inScope(supabase.from("subject_coefficients").select("position"), schoolId, scope)
    .order("position", { ascending: false })
    .limit(1);
  return Math.min((data?.[0]?.position ?? 0) + 1, 100);
}

function readScope(scope: unknown, subjectId: unknown) {
  const s = coefficientScopeSchema.safeParse(scope);
  const subject = gradingIdSchema.safeParse(subjectId);
  return s.success && subject.success ? { scope: s.data, subjectId: subject.data } : null;
}

/** Add the subject to the scope, or change its coefficient / number of contrôles. */
export async function saveCoefficient(
  scope: unknown,
  subjectId: unknown,
  input: unknown,
): Promise<StructureActionResult<null, CoefficientField>> {
  const actor = await getSchoolActor("grades.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const target = readScope(scope, subjectId);
  if (!target) return { ok: false, error: "notFound" };
  const v = parseInput<typeof coefficientSchema, CoefficientField>(coefficientSchema, input);
  if ("error" in v) return { ok: false, error: v.error, field: v.field };

  const supabase = await createClient();
  const values = { coefficient: v.values.coefficient, controls_count: v.values.controlsCount };
  const update = () =>
    inScope(supabase.from("subject_coefficients").update(values), actor.schoolId, target.scope)
      .eq("subject_id", target.subjectId)
      .select("id");
  let result = await update();
  if (!result.error && result.data.length === 0) {
    const inserted = await supabase
      .from("subject_coefficients")
      .insert({
        school_id: actor.schoolId,
        academic_year_id: target.scope.yearId,
        level_id: target.scope.levelId,
        track_id: target.scope.trackId,
        subject_id: target.subjectId,
        position: await nextPosition(supabase, actor.schoolId, target.scope),
        ...values,
      })
      .select("id");
    result = inserted.error?.code === "23505" ? await update() : inserted;
  }
  if (result.error) {
    const key = dbErrorKey(result.error, COEFFICIENT_ERRORS);
    return { ok: false, error: key, field: FIELD_OF[key] };
  }
  if (result.data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "grading.coefficient.save", "subject_coefficient", result.data[0].id, {
    year: target.scope.yearId,
    level: target.scope.levelId,
    track: target.scope.trackId,
    subject: target.subjectId,
    coefficient: v.values.coefficient,
    controls: v.values.controlsCount,
  });
  return { ok: true, data: null };
}

export async function removeCoefficient(scope: unknown, subjectId: unknown): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("grades.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const target = readScope(scope, subjectId);
  if (!target) return { ok: false, error: "notFound" };

  const { data, error } = await inScope(
    (await createClient()).from("subject_coefficients").delete(),
    actor.schoolId,
    target.scope,
  )
    .eq("subject_id", target.subjectId)
    .select("id");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await auditStructure(actor, "grading.coefficient.delete", "subject_coefficient", data[0].id, {
    year: target.scope.yearId,
    level: target.scope.levelId,
    track: target.scope.trackId,
    subject: target.subjectId,
  });
  return { ok: true, data: null };
}

/** Report card order of a scope: the subjects in their new order (positions 1, 2, …). */
export async function reorderCoefficients(scope: unknown, subjectIds: unknown): Promise<StructureActionResult<null>> {
  const actor = await getSchoolActor("grades.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const s = coefficientScopeSchema.safeParse(scope);
  const order = subjectOrderSchema.safeParse(subjectIds);
  if (!s.success || !order.success || new Set(order.data).size !== order.data.length) {
    return { ok: false, error: "notFound" };
  }

  const supabase = await createClient();
  const results = await Promise.all(
    order.data.map((subject, i) =>
      inScope(supabase.from("subject_coefficients").update({ position: i + 1 }), actor.schoolId, s.data)
        .eq("subject_id", subject)
        .select("id"),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, error: dbErrorKey(failed.error) };
  if (results.some((r) => r.data?.length === 0)) return { ok: false, error: "notFound" };

  await auditStructure(actor, "grading.coefficient.reorder", "level", s.data.levelId, {
    year: s.data.yearId,
    track: s.data.trackId,
    subjects: order.data.length,
  });
  return { ok: true, data: null };
}
