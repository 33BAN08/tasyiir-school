"use server";

import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { getSchoolActor } from "@/lib/auth/school-actor";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { isPhotoPathOf, PHOTO_BUCKET } from "@/lib/students/photo-rules";
import { createClient } from "@/lib/supabase/server";
import { studentIdSchema } from "@/lib/validations/students";

// Student photos (students.manage). The browser uploads the resized file with
// the user's own session (Storage RLS: own school's folder, an existing
// student); these actions then point the student at it, through RLS too.
// Storage only lets a user delete a file they can read, and only the CURRENT
// photo is readable: so the old file is deleted before the new path is saved.
// Error keys: `students.errors`.

type Result = { ok: true; data: null } | { ok: false; error: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function currentPhoto(supabase: Supabase, schoolId: string, studentId: string) {
  const { data } = await supabase
    .from("students")
    .select("photo_path")
    .eq("id", studentId)
    .eq("school_id", schoolId)
    .maybeSingle();
  return data;
}

/** Points the student at a file the browser has just uploaded. */
export async function setStudentPhoto(studentId: unknown, path: unknown): Promise<Result> {
  const actor = await getSchoolActor("students.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = studentIdSchema.safeParse(studentId);
  const file = z.string().max(200).safeParse(path);
  if (!id.success) return { ok: false, error: "notFound" };
  if (!file.success || !isPhotoPathOf(file.data, actor.schoolId, id.data)) return { ok: false, error: "photoUpload" };

  const supabase = await createClient();
  const student = await currentPhoto(supabase, actor.schoolId, id.data);
  if (!student) return { ok: false, error: "notFound" };
  if (student.photo_path === file.data) return { ok: true, data: null };

  const old = student.photo_path;
  const point = (photoPath: string | null) =>
    supabase.from("students").update({ photo_path: photoPath }).eq("id", id.data).eq("school_id", actor.schoolId);

  // 1. The new file must really be there: point at it, then read it. If it is
  //    missing, the old photo stays.
  const { error } = await point(file.data);
  if (error) return { ok: false, error: dbErrorKey(error) };
  const check = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(file.data, 60);
  if (check.error) {
    await point(old);
    return { ok: false, error: "photoUpload" };
  }

  // 2. Delete the old file. Only a current photo can be deleted, so point back
  //    at it for the delete, then at the new one again.
  if (old) {
    await point(old);
    await supabase.storage.from(PHOTO_BUCKET).remove([old]);
    const { error: finalError } = await point(file.data);
    if (finalError) return { ok: false, error: dbErrorKey(finalError) };
  }

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "student.photo_set",
    entity: "student",
    entityId: id.data,
  });
  return { ok: true, data: null };
}

export async function removeStudentPhoto(studentId: unknown): Promise<Result> {
  const actor = await getSchoolActor("students.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const id = studentIdSchema.safeParse(studentId);
  if (!id.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const student = await currentPhoto(supabase, actor.schoolId, id.data);
  if (!student) return { ok: false, error: "notFound" };
  if (!student.photo_path) return { ok: true, data: null };

  await supabase.storage.from(PHOTO_BUCKET).remove([student.photo_path]);
  const { error } = await supabase
    .from("students")
    .update({ photo_path: null })
    .eq("id", id.data)
    .eq("school_id", actor.schoolId);
  if (error) return { ok: false, error: dbErrorKey(error) };

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "student.photo_remove",
    entity: "student",
    entityId: id.data,
  });
  return { ok: true, data: null };
}
