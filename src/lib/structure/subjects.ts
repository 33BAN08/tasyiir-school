import "server-only";

import { getTranslations } from "next-intl/server";

import { routing } from "@/i18n/routing";
import { SUBJECT_TEMPLATE, type SubjectColor } from "@/lib/structure/subject-template";
import { createClient } from "@/lib/supabase/server";

// Reads for the subjects page, through RLS (own school only); the
// explicit school filter is a second fence.

export type Subject = { id: string; name: string; code: string | null; color: SubjectColor };

export const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

export async function listSubjects(schoolId: string): Promise<Subject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("subjects").select("id, name, code, color").eq("school_id", schoolId);
  if (error) throw new Error("listSubjects failed");
  return data.map((row) => ({ ...row, color: row.color as SubjectColor })).sort(byName);
}

/**
 * Template subjects the school already has. A template subject may have been
 * created from any UI language ("Mathématiques" or "الرياضيات"), or renamed:
 * it counts as present if its code, or its name in ANY language, exists.
 */
export async function presentTemplateSubjects(subjects: { name: string; code: string | null }[]): Promise<Set<string>> {
  const names = new Set(subjects.map((s) => s.name.toLowerCase()));
  const codes = new Set(subjects.flatMap((s) => (s.code ? [s.code.toLowerCase()] : [])));
  const present = new Set<string>();
  for (const locale of routing.locales) {
    const t = await getTranslations({ locale, namespace: "setup.subjects.template.names" });
    for (const s of SUBJECT_TEMPLATE) {
      if (codes.has(s.code.toLowerCase()) || names.has(t(s.key as Parameters<typeof t>[0]).toLowerCase())) {
        present.add(s.key);
      }
    }
  }
  return present;
}
