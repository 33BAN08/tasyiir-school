import "server-only";

import { createClient } from "@/lib/supabase/server";

export type SchoolContact = {
  phone: string | null;
  whatsapp: string | null;
  /** Null while nobody has changed it (the row was created with the school). */
  lastChange: { at: string; byName: string | null } | null;
};

/**
 * The school's contact card (seeded with the school). Every active account of
 * the school reads it (RLS); null when it cannot be read.
 */
export async function getSchoolContact(schoolId: string, withAuthor = false): Promise<SchoolContact | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_contacts")
    .select("phone, whatsapp, updated_at, updated_by")
    .eq("school_id", schoolId)
    .maybeSingle();
  if (error) throw new Error(`getSchoolContact failed: ${error.code}`);
  if (!data) return null;

  let byName: string | null = null;
  if (withAuthor && data.updated_by) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", data.updated_by)
      .maybeSingle();
    byName = profile?.full_name ?? null;
  }

  return {
    phone: data.phone,
    whatsapp: data.whatsapp,
    lastChange: data.updated_by ? { at: data.updated_at, byName } : null,
  };
}
