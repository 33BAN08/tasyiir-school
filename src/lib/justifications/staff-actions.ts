"use server";

import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { getSchoolActor, type SchoolActor } from "@/lib/auth/school-actor";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { createClient } from "@/lib/supabase/server";

import { isJustificationPathOf, JUSTIFICATION_BUCKET } from "./rules";

// Staff (attendance.manage): review a parent's justification, justify ONE
// absence from a paper note (approved at once, with an optional photo), and
// remove a justification. Saved with the staff member's own session: the
// database decides (RLS + triggers). Error keys: `absences.justifications.errors`.

type Result = { ok: true; data: null } | { ok: false; error: string };

const reasonSchema = z.string().trim().min(1, { error: "reasonRequired" }).max(500, { error: "tooLong" });
const noteSchema = z
  .string()
  .trim()
  .max(300, { error: "noteTooLong" })
  .transform((v) => v || null);

const DB_ERRORS = {
  justifications_mark_fkey: "markNotFound",
  justifications_student_fkey: "notFound",
  justifications_reason_check: "reasonRequired",
  justifications_review_note_check: "noteTooLong",
  justifications_file_path_check: "fileUpload",
};

async function dropFile(path: string | null) {
  if (!path) return;
  const supabase = await createClient();
  await supabase.storage.from(JUSTIFICATION_BUCKET).remove([path]);
}

/** Approve, reject or put back to pending (the school's reply `note` is optional, kept only for approved / rejected). */
export async function reviewJustification(id: unknown, status: unknown, note: unknown): Promise<Result> {
  const actor = await getSchoolActor("attendance.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const justification = z.uuid().safeParse(id);
  const next = z.enum(["pending", "approved", "rejected"]).safeParse(status);
  const text = noteSchema.safeParse(note ?? "");
  if (!justification.success || !next.success) return { ok: false, error: "notFound" };
  if (!text.success) return { ok: false, error: "noteTooLong" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("justifications")
    .update({ status: next.data, review_note: next.data === "pending" ? null : text.data })
    .eq("id", justification.data)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return { ok: false, error: dbErrorKey(error, DB_ERRORS) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "justification.review",
    entity: "justification",
    entityId: justification.data,
    data: { status: next.data },
  });
  return { ok: true, data: null };
}

/**
 * Justify one absence (or late arrival) of a student from a paper note:
 * approved at once, on that mark's day. `filePath` = the note the browser has
 * just uploaded (optional); it is removed again when the saving fails.
 */
export async function justifyAbsence(sessionId: unknown, studentId: unknown, reason: unknown, filePath: unknown): Promise<Result> {
  const file = z.string().max(200).nullable().safeParse(filePath ?? null);
  const path = file.success ? file.data : null;
  const fail = async (error: string): Promise<Result> => {
    await dropFile(path);
    return { ok: false, error };
  };

  const actor: SchoolActor | null = await getSchoolActor("attendance.manage");
  if (!actor) return fail("forbidden");
  const session = z.uuid().safeParse(sessionId);
  const student = z.uuid().safeParse(studentId);
  if (!session.success || !student.success) return fail("notFound");
  const text = reasonSchema.safeParse(reason);
  if (!text.success) return fail(text.error.issues[0]?.message ?? "invalid");
  if (!file.success || (path && !isJustificationPathOf(path, actor.schoolId, student.data))) return fail("fileUpload");

  const supabase = await createClient();
  if (path) {
    const check = await supabase.storage.from(JUSTIFICATION_BUCKET).createSignedUrl(path, 60);
    if (check.error) return fail("fileUpload");
  }

  // The dates are placeholders: the database takes the mark's day.
  const { data, error } = await supabase
    .from("justifications")
    .insert({
      school_id: actor.schoolId,
      student_id: student.data,
      kind: "mark",
      session_id: session.data,
      from_date: "2000-01-01",
      to_date: "2000-01-01",
      reason: text.data,
      file_path: path,
      submitted_by: actor.id,
    })
    .select("id")
    .single();
  // A session that is not in the school leaves the trigger with no day to copy (not-null violation).
  if (error) return fail(error.code === "23502" ? "markNotFound" : dbErrorKey(error, DB_ERRORS));

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "justification.mark",
    entity: "justification",
    entityId: data.id,
    data: { session_id: session.data, student_id: student.data, file: Boolean(path) },
  });
  return { ok: true, data: null };
}

/** Removes a justification and its note (staff only; reviewed notes are otherwise kept as evidence). */
export async function removeJustification(id: unknown): Promise<Result> {
  const actor = await getSchoolActor("attendance.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("justifications")
    .select("file_path")
    .eq("id", parsed.data)
    .eq("school_id", actor.schoolId)
    .maybeSingle();
  if (!row) return { ok: false, error: "notFound" };

  const { data, error } = await supabase
    .from("justifications")
    .delete()
    .eq("id", parsed.data)
    .eq("school_id", actor.schoolId)
    .select("id");
  if (error) return { ok: false, error: dbErrorKey(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await dropFile(row.file_path);
  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "justification.remove",
    entity: "justification",
    entityId: parsed.data,
  });
  return { ok: true, data: null };
}
