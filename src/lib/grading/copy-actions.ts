"use server";

import { getSchoolActor } from "@/lib/auth/school-actor";
import { auditStructure, type StructureActionResult } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { gradingIdSchema } from "@/lib/validations/grading";

// Copy of the grading setup from an earlier year (grades.manage). Preview and
// copy are the SAME database function (copy_grading_from_year, apply false /
// true), so what the preview lists is exactly what the copy does.
// Nothing already set in the target is overwritten. Error keys: `grading.errors`.

export type CopyStatus = "copy" | "exists";

const COPY_ERRORS = {
  copy_grading_forbidden: "forbidden",
  copy_grading_not_found: "notFound",
  copy_grading_source_not_earlier: "sourceNotEarlier",
};

export type YearCopyLine = {
  kind: "rules" | "coefficient";
  levelId: string;
  trackId: string | null;
  subjectId: string | null;
  status: CopyStatus;
};

async function runYearCopy(
  fromYearId: unknown,
  toYearId: unknown,
  apply: boolean,
): Promise<StructureActionResult<YearCopyLine[]>> {
  const actor = await getSchoolActor("grades.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const from = gradingIdSchema.safeParse(fromYearId);
  const to = gradingIdSchema.safeParse(toYearId);
  if (!from.success || !to.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient()).rpc("copy_grading_from_year", {
    p_from_year: from.data,
    p_to_year: to.data,
    p_apply: apply,
  });
  if (error) return { ok: false, error: dbErrorKey(error, COPY_ERRORS) };

  const lines = data.map((r) => ({
    kind: r.kind === "rules" ? ("rules" as const) : ("coefficient" as const),
    levelId: r.level_id,
    trackId: r.track_id ?? null,
    subjectId: r.subject_id ?? null,
    status: r.status as CopyStatus,
  }));
  if (apply) {
    await auditStructure(actor, "grading.copy.year", "academic_year", to.data, {
      from: from.data,
      copied: lines.filter((l) => l.status === "copy").length,
    });
  }
  return { ok: true, data: lines };
}

export async function previewYearCopy(fromYearId: unknown, toYearId: unknown) {
  return runYearCopy(fromYearId, toYearId, false);
}

export async function copyGradingFromYear(fromYearId: unknown, toYearId: unknown) {
  return runYearCopy(fromYearId, toYearId, true);
}
