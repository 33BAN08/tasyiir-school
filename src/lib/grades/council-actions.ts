"use server";

import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { getSchoolActor } from "@/lib/auth/school-actor";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { gradeIdSchema } from "@/lib/validations/grades";

// Class-council remarks of a class for a semester (period null = the year),
// one sheet in ONE call to public.save_council_remarks (all or nothing; RLS:
// grades.manage). Empty text = no remark. Error keys: `councilRemarks.errors`.

const COUNCIL_ERRORS = {
  council_remarks_forbidden: "forbidden",
  council_remarks_too_many: "tooMany",
  council_remark_not_in_class: "notInClass",
  council_remark_class_not_found: "notFound",
  council_remarks_body_check: "tooLong",
};

const cellsSchema = z
  .array(z.object({ studentId: gradeIdSchema, body: z.string().max(500, { error: "tooLong" }) }))
  .max(200, { error: "tooMany" });

export async function saveCouncilRemarks(
  classId: unknown,
  periodId: unknown,
  cells: unknown,
): Promise<{ ok: true; data: { saved: number } } | { ok: false; error: string }> {
  const actor = await getSchoolActor("grades.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const klass = gradeIdSchema.safeParse(classId);
  const period = gradeIdSchema.nullable().safeParse(periodId);
  if (!klass.success || !period.success) return { ok: false, error: "notFound" };
  const parsed = cellsSchema.safeParse(cells);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "generic" };
  if (parsed.data.length === 0) return { ok: true, data: { saved: 0 } };

  const { data, error } = await (await createClient()).rpc("save_council_remarks", {
    p_class: klass.data,
    // The generated type says string; NULL = the year.
    p_period: period.data as string,
    p_cells: parsed.data.map((c) => ({ student_id: c.studentId, body: c.body.trim() })),
  });
  if (error) return { ok: false, error: dbErrorKey(error, COUNCIL_ERRORS) };

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "grades.council.save",
    entity: "class",
    entityId: klass.data,
    data: { period: period.data, cells: parsed.data.length, rows: data },
  });
  return { ok: true, data: { saved: data } };
}
