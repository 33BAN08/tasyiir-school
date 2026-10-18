"use server";

import { z } from "zod";

import { schoolClock } from "@/lib/attendance/clock";
import { logAudit } from "@/lib/audit";
import { areaFor } from "@/lib/auth/roles";
import { blockedPath, getCurrentUser } from "@/lib/auth/session";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";
import { justificationSchema } from "@/lib/validations/justifications";

import {
  addDays,
  AHEAD_DAYS,
  isJustificationPathOf,
  JUSTIFICATION_BUCKET,
  JUSTIFICATION_URL_SECONDS,
  LOOKBACK_DAYS,
} from "./rules";

// A parent's justifications of their child's absences (whole days), saved
// with their own session: the database decides (RLS, constraints, triggers).
// A parent's justification is always 'pending' until the school reviews it.
// "Today" is the database's (Africa/Casablanca). Error keys are under
// `portal.absences.errors`.

type Field = "fromDate" | "toDate" | "reason";
type Result<T = null> = { ok: true; data: T } | { ok: false; error: string; field?: Field };

const DB_ERRORS = {
  justification_dates_out_of_range: "datesOutOfRange",
  justifications_dates_check: "endBeforeStart",
  justifications_reason_check: "reasonRequired",
  justifications_file_path_check: "fileUpload",
};

async function currentParent() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || blockedPath(user) || !user.schoolId || areaFor(user) !== "portal") return null;
  return { id: user.id, schoolId: user.schoolId };
}

/** Removes a file the browser uploaded for a sending that did not go through (the uploader may delete it). */
async function dropFile(path: string | null) {
  if (!path) return;
  const supabase = await createClient();
  await supabase.storage.from(JUSTIFICATION_BUCKET).remove([path]);
}

/** A parent sends a justification for whole days of their child; `filePath` = the note the browser has just uploaded (optional). */
export async function submitJustification(studentId: unknown, values: unknown, filePath: unknown): Promise<Result> {
  const file = z.string().max(200).nullable().safeParse(filePath ?? null);
  const path = file.success ? file.data : null;
  const fail = async (error: string, field?: Field): Promise<Result> => {
    await dropFile(path);
    return { ok: false, error, field };
  };

  const parent = await currentParent();
  if (!parent) return fail("forbidden");
  const student = z.uuid().safeParse(studentId);
  if (!student.success) return fail("notFound");
  if (!file.success || (path && !isJustificationPathOf(path, parent.schoolId, student.data))) return fail("fileUpload");
  const parsed = justificationSchema.safeParse(values);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return fail(issue?.message ?? "invalid", field === "fromDate" || field === "toDate" || field === "reason" ? field : undefined);
  }

  const { date: today } = await schoolClock();
  if (parsed.data.fromDate < addDays(today, -LOOKBACK_DAYS)) return fail("tooOld", "fromDate");
  if (parsed.data.toDate > addDays(today, AHEAD_DAYS)) return fail("tooFarAhead", "toDate");

  const supabase = await createClient();
  if (path) {
    // The note must really be there (the upload may have failed half way).
    const check = await supabase.storage.from(JUSTIFICATION_BUCKET).createSignedUrl(path, 60);
    if (check.error) return fail("fileUpload");
  }

  const { data, error } = await supabase
    .from("justifications")
    .insert({
      school_id: parent.schoolId,
      student_id: student.data,
      kind: "days",
      from_date: parsed.data.fromDate,
      to_date: parsed.data.toDate,
      reason: parsed.data.reason,
      file_path: path,
      submitted_by: parent.id,
    })
    .select("id")
    .single();
  if (error) return fail(dbErrorKey(error, DB_ERRORS));

  await logAudit({
    actorId: parent.id,
    schoolId: parent.schoolId,
    action: "justification.submit",
    entity: "justification",
    entityId: data.id,
    data: { student_id: student.data, from: parsed.data.fromDate, to: parsed.data.toDate, file: Boolean(path) },
  });
  return { ok: true, data: null };
}

/** A parent withdraws their own justification while it is still pending (and its note, if any). */
export async function cancelJustification(id: unknown): Promise<Result> {
  const parent = await currentParent();
  if (!parent) return { ok: false, error: "forbidden" };
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("justifications")
    .select("file_path")
    .eq("id", parsed.data)
    .eq("school_id", parent.schoolId)
    .eq("status", "pending")
    .maybeSingle();
  if (!row) return { ok: false, error: "notPending" };

  const { data: deleted, error } = await supabase
    .from("justifications")
    .delete()
    .eq("id", parsed.data)
    .eq("school_id", parent.schoolId)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (deleted.length === 0) return { ok: false, error: "notPending" }; // reviewed in the meantime

  await dropFile(row.file_path);
  await logAudit({
    actorId: parent.id,
    schoolId: parent.schoolId,
    action: "justification.cancel",
    entity: "justification",
    entityId: parsed.data,
  });
  return { ok: true, data: null };
}

/**
 * A short-lived link to a justification's note, for whoever can read that
 * justification (a parent of the child, staff): Storage RLS decides.
 */
export async function getJustificationFileUrl(id: unknown): Promise<Result<{ url: string }>> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || blockedPath(user) || !user.schoolId) return { ok: false, error: "forbidden" };
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("justifications")
    .select("file_path")
    .eq("id", parsed.data)
    .eq("school_id", user.schoolId)
    .maybeSingle();
  if (!row?.file_path) return { ok: false, error: "notFound" };
  const { data, error } = await supabase.storage
    .from(JUSTIFICATION_BUCKET)
    .createSignedUrl(row.file_path, JUSTIFICATION_URL_SECONDS);
  if (error || !data) return { ok: false, error: "fileUnavailable" };
  return { ok: true, data: { url: data.signedUrl } };
}
