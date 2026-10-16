import "server-only";

import { phoneLoginEmail } from "@/lib/parents/phone";
import { createAdminClient } from "@/lib/supabase/admin";

// Parent AUTH accounts, with the secret key (server only). Callers have
// checked parents.manage and read the guardian through RLS first.

/**
 * True only for a parent account of this school. Guards every secret-key
 * call: a guardian row could be pointed at a staff profile of the same
 * school (its FK only checks the school), and we must never reset or delete
 * a staff account from the parents screens.
 */
export async function isParentAccount(schoolId: string, profileId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("id, role:roles!inner(key)")
    .eq("id", profileId)
    .eq("school_id", schoolId)
    .eq("role.key", "parent")
    .maybeSingle();
  return Boolean(data);
}

/**
 * Brings the parent account in line with the guardian: sign-in phone and
 * name. Same account and password. Returns an error key, or null.
 */
export async function syncParentAccount(
  schoolId: string,
  profileId: string,
  { phone, fullName }: { phone: string; fullName: string },
): Promise<string | null> {
  const admin = createAdminClient();
  // Another parent account (any school) already signs in with this phone?
  // Supabase answers that update with a bare 500, so ask first. Every parent
  // account belongs to a guardian; staff never sign in with a phone.
  const { data: taken } = await admin
    .from("guardians")
    .select("id")
    .eq("phone", phone)
    .not("profile_id", "is", null)
    .neq("profile_id", profileId)
    .limit(1);
  if (taken?.length) return "phoneHasAccount";

  const { error } = await admin.auth.admin.updateUserById(profileId, {
    email: phoneLoginEmail(phone),
    email_confirm: true,
  });
  if (error) {
    if (error.code === "email_exists") return "phoneHasAccount";
    console.error("syncParentAccount: updateUserById failed", error.code);
    return "generic";
  }
  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", profileId)
    .eq("school_id", schoolId);
  if (profileError) console.error("syncParentAccount: profile update failed", profileError.code);
  return null;
}
