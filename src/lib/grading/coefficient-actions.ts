"use server";

import { getSchoolActor } from "@/lib/auth/school-actor";
import { auditStructure, type StructureActionResult } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { gradingIdSchema, gridCellsSchema } from "@/lib/validations/grading";

// The coefficient grid (grades.manage): every changed cell saved in ONE call
// to public.save_subject_coefficients (one transaction, all or nothing).
// A cell = level + filière (null = the level's common row) + subject; a null
// coefficient removes the row. Error keys: `grading.errors`; `cell` points at
// the first invalid cell ("<level>|<track>|<subject>").

const GRID_ERRORS = {
  coefficients_forbidden: "forbidden",
  coefficients_year_not_found: "notFound",
  coefficients_too_many: "tooManyCells",
  subject_coefficients_coefficient_check: "coefficientRange",
  subject_coefficients_controls_check: "controlsRange",
};

export async function saveCoefficientGrid(
  yearId: unknown,
  cells: unknown,
): Promise<StructureActionResult<{ saved: number }> & { cell?: string }> {
  const actor = await getSchoolActor("grades.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const year = gradingIdSchema.safeParse(yearId);
  if (!year.success) return { ok: false, error: "notFound" };
  const parsed = gridCellsSchema.safeParse(cells);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const index = typeof issue?.path[0] === "number" ? issue.path[0] : -1;
    const bad = Array.isArray(cells) ? (cells[index] as Record<string, unknown> | undefined) : undefined;
    return {
      ok: false,
      error: issue?.message ?? "generic",
      cell: bad ? `${bad.levelId}|${bad.trackId ?? ""}|${bad.subjectId}` : undefined,
    };
  }
  if (parsed.data.length === 0) return { ok: true, data: { saved: 0 } };

  const { data, error } = await (await createClient()).rpc("save_subject_coefficients", {
    p_year: year.data,
    p_cells: parsed.data.map((c) => ({
      level_id: c.levelId,
      track_id: c.trackId,
      subject_id: c.subjectId,
      coefficient: c.coefficient,
      controls_count: c.controlsCount,
      position: c.position,
    })),
  });
  if (error) return { ok: false, error: dbErrorKey(error, GRID_ERRORS) };

  await auditStructure(actor, "grading.coefficients.save", "academic_year", year.data, {
    cells: parsed.data.length,
    rows: data,
  });
  return { ok: true, data: { saved: data } };
}
