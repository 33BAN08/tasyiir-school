import "server-only";

import { getLocale } from "next-intl/server";
import { connection } from "next/server";
import { cache } from "react";

import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string;
  schoolId: string | null;
  roleKey: string;
  locale: string;
  mustChangePassword: boolean;
};

/**
 * Data Access Layer: the signed-in user with their profile, or null.
 * Deduplicated per request. Reads cookies, so callers must sit inside <Suspense>.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Never during prerendering: the Supabase client reads the clock (token expiry).
  await connection();
  const supabase = await createClient();

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, school_id, locale, must_change_password, role:roles(key)")
    .eq("id", claims.sub)
    .maybeSingle();

  if (!profile?.role) return null;

  return {
    id: profile.id,
    email: typeof claims.email === "string" ? claims.email : null,
    fullName: profile.full_name,
    schoolId: profile.school_id,
    roleKey: profile.role.key,
    locale: profile.locale,
    mustChangePassword: profile.must_change_password,
  };
});

/** For protected pages: signed-in user with a profile who has set their own password. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login", locale: await getLocale() });
  if (user.mustChangePassword) {
    return redirect({ href: "/change-password", locale: await getLocale() });
  }
  return user;
}
