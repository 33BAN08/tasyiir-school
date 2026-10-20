"use server";

import { logAudit } from "@/lib/audit";
import { getSchoolActor } from "@/lib/auth/school-actor";
import { createClient } from "@/lib/supabase/server";
import { schoolContactSchema } from "@/lib/validations/school-contact";

// The school's contact card (settings.manage = director), written through RLS
// with the caller's session: the table grants UPDATE on the two numbers only.
// Error keys: `schoolSettings.errors`.

/** `field` = the form field refused ("phone" | "whatsapp"). */
export type SchoolContactResult = { ok: true } | { ok: false; error: string; field?: string };

export async function saveSchoolContact(input: unknown): Promise<SchoolContactResult> {
  const actor = await getSchoolActor("settings.manage");
  if (!actor) return { ok: false, error: "forbidden" };
  const parsed = schoolContactSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: issue?.path.join(".") || undefined };
  }
  const { phone, whatsapp } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("school_contacts")
    .update({ phone, whatsapp })
    .eq("school_id", actor.schoolId)
    .select("school_id");
  if (error) return { ok: false, error: error.code === "42501" ? "forbidden" : "failed" };
  if (data.length === 0) return { ok: false, error: "forbidden" };

  await logAudit({
    actorId: actor.id,
    schoolId: actor.schoolId,
    action: "school_contact.update",
    entity: "school_contacts",
    entityId: actor.schoolId,
    data: { phone, whatsapp },
  });
  return { ok: true };
}
