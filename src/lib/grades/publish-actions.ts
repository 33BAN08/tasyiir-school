"use server";

import { logAudit } from "@/lib/audit";
import { getSchoolActor } from "@/lib/auth/school-actor";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { gradeIdSchema } from "@/lib/validations/grades";

// Publishing a class's semester (or year) to parents: public.publish_grades /
// unpublish_grades (one transaction each: report cards + notifications). The
// database checks the permission (grades.manage) and the lock again.
// Error keys: `grades.publish.errors`.

type Result = { ok: true; data: { cards: number } } | { ok: false; error: string };

const PUBLISH_ERRORS = {
  publish_forbidden: "forbidden",
  publish_class_not_found: "notFound",
  publish_period_not_found: "notFound",
  publish_not_found: "notFound",
  publish_period_not_locked: "periodNotLocked",
  publish_periods_not_locked: "periodsNotLocked",
};

/** `periodId` null = the year (every semester must be locked). */
export async function publishGrades(classId: unknown, periodId: unknown, showRank: unknown): Promise<Result> {
  const actor = await getSchoolActor("grades.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const klass = gradeIdSchema.safeParse(classId);
  const period = gradeIdSchema.nullable().safeParse(periodId);
  if (!klass.success || !period.success) return { ok: false, error: "notFound" };
  if (typeof showRank !== "boolean") return { ok: false, error: "generic" };

  const { data, error } = await (await createClient()).rpc("publish_grades", {
    p_class: klass.data,
    // The generated type says string; NULL = the year.
    p_period: period.data as string,
    p_show_rank: showRank,
  });
  if (error) return { ok: false, error: dbErrorKey(error, PUBLISH_ERRORS) };

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "grades.publish",
    entity: "class",
    entityId: klass.data,
    data: { period: period.data, showRank, cards: data },
  });
  return { ok: true, data: { cards: data } };
}

export async function unpublishGrades(publicationId: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getSchoolActor("grades.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = gradeIdSchema.safeParse(publicationId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { error } = await (await createClient()).rpc("unpublish_grades", { p_publication: id.data });
  if (error) return { ok: false, error: dbErrorKey(error, PUBLISH_ERRORS) };

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "grades.unpublish",
    entity: "grade_publication",
    entityId: id.data,
    data: {},
  });
  return { ok: true };
}
