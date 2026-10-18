// Browser only. Prepares a picked note and uploads it with the user's own
// session (Storage RLS decides who may upload for which student).

import { createClient } from "@/lib/supabase/client";

import { prepareJustificationFile, type FileError } from "./prepare-file";
import { JUSTIFICATION_BUCKET, justificationPath } from "./rules";

/** Prepares and uploads the note; `path` is null when no file was picked. */
export async function uploadNote(
  file: File | null,
  schoolId: string,
  studentId: string,
): Promise<{ path: string | null } | { error: FileError | "fileUpload" }> {
  if (!file) return { path: null };
  const prepared = await prepareJustificationFile(file);
  if ("error" in prepared) return { error: prepared.error };
  const path = justificationPath(schoolId, studentId, crypto.randomUUID(), prepared.ext);
  const { error } = await createClient()
    .storage.from(JUSTIFICATION_BUCKET)
    .upload(path, prepared.blob, { contentType: prepared.blob.type, upsert: false });
  return error ? { error: "fileUpload" } : { path };
}
