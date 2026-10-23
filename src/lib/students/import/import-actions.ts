"use server";

import { z } from "zod";

import { getSchoolActor, type SchoolActor } from "@/lib/auth/school-actor";
import { auditStructure } from "@/lib/structure/action-utils";
import { dbErrorKey } from "@/lib/structure/db-errors";
import { getCurrentYear } from "@/lib/students/students";
import { createClient } from "@/lib/supabase/server";

import { MAX_IMPORT_ROWS } from "./columns";
import { readImportFile } from "./read";
import type { CommitResult, ImportFileError, ImportPreview, PreviewResult } from "./types";
import { validateImport, type ImportPayloadRow } from "./validate";

// Student import (students.manage). Both steps take the SAME file: the
// preview reads and checks it; the import reads and checks it again (nothing
// from the browser's preview is trusted), refuses if any row still has an
// error, and sends the ready rows to public.import_students(), which writes
// everything in one transaction through RLS. The browser may also send
// "exclude": the file lines the user unticked (e.g. possible duplicates),
// which are left out. Error keys: `students.import.errors`.

type Prepared =
  | { ok: true; actor: SchoolActor; preview: ImportPreview; payload: { line: number; row: ImportPayloadRow }[] }
  | { ok: false; error: string; file?: ImportFileError };

async function prepare(formData: FormData): Promise<Prepared> {
  const actor = await getSchoolActor("students.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const entry = formData.get("file");
  const file = entry instanceof File ? entry : null;
  const read = await readImportFile(file);
  if ("error" in read) return { ok: false, error: "file", file: read.error };
  if (read.columns.has("parentPhone") && !actor.permissions.has("parents.manage")) {
    return { ok: false, error: "file", file: { key: "parentsForbidden" } };
  }
  const year = await getCurrentYear(actor.schoolId);
  if (!year) return { ok: false, error: "file", file: { key: "noCurrentYear" } };
  const checked = await validateImport(actor.schoolId, year.id, file!.name, read);
  const { data: usage } = await (await createClient()).rpc("school_usage");
  const row = usage?.[0];
  if (row?.max_students != null) checked.preview.placesLeft = Math.max(0, row.max_students - row.students);
  return { ok: true, actor, ...checked };
}

export async function previewImport(formData: FormData): Promise<PreviewResult> {
  const prepared = await prepare(formData);
  if (!prepared.ok) return prepared;
  return { ok: true, data: prepared.preview };
}

/** File lines the user unticked: a JSON list of line numbers ("" or absent = none). */
const excludeSchema = z.array(z.number().int().min(1)).max(MAX_IMPORT_ROWS);

function excludedLines(formData: FormData): Set<number> | null {
  const raw = formData.get("exclude");
  if (raw === null || raw === "") return new Set();
  try {
    const parsed = excludeSchema.safeParse(JSON.parse(String(raw)));
    return parsed.success ? new Set(parsed.data) : null;
  } catch {
    return null;
  }
}

const COMMIT_CONSTRAINTS = {
  students_code_massar_key: "massarTakenMeanwhile",
  student_enrollments_class_fkey: "classChangedMeanwhile",
  student_guardians_parent_key: "relationTakenMeanwhile",
};

export async function commitImport(formData: FormData): Promise<CommitResult> {
  const prepared = await prepare(formData);
  if (!prepared.ok) return prepared;
  const { actor, preview } = prepared;
  if (preview.counts.error > 0) return { ok: false, error: "hasErrors" };
  const exclude = excludedLines(formData);
  if (!exclude) return { ok: false, error: "generic" };
  const payload = prepared.payload.filter((p) => !exclude.has(p.line)).map((p) => p.row);
  const excluded = prepared.payload.length - payload.length;
  if (payload.length === 0) return { ok: false, error: "nothingToImport" };

  const { data, error } = await (await createClient()).rpc("import_students", {
    p_rows: payload satisfies ImportPayloadRow[],
  });
  if (error) {
    if (error.code === "P0002") return { ok: false, error: "file", file: { key: "noCurrentYear" } };
    return { ok: false, error: dbErrorKey(error, COMMIT_CONSTRAINTS) };
  }

  await auditStructure(actor, "students.import", "school", actor.schoolId, {
    created: data,
    skipped: preview.counts.exists,
    excluded,
    file: preview.fileName.slice(0, 120),
  });
  return { ok: true, data: { created: data, skipped: preview.counts.exists, excluded } };
}
