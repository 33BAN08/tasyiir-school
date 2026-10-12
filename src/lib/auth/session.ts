import "server-only";

import { getLocale } from "next-intl/server";
import { connection } from "next/server";
import { cache } from "react";

import { redirect } from "@/i18n/navigation";
import { areaFor, homeFor, type Area } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  email: string | null;
  fullName: string;
  schoolId: string | null;
  roleId: string;
  roleKey: string;
  roleName: string;
  locale: string;
  mustChangePassword: boolean;
  /** The user's school is suspended. roleKey/roleName are then empty: never use them. */
  schoolSuspended: boolean;
  /** The director deactivated this account. roleKey/roleName are then empty: never use them. */
  accountDeactivated: boolean;
  /**
   * Same rule as the DB's private.is_platform_owner(): the system platform_owner
   * role, with no school on the profile NOR on the role. Never decide this from roleKey.
   */
  isPlatformOwner: boolean;
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
    .select(
      "id, full_name, school_id, role_id, locale, must_change_password, deactivated_at, role:roles(key, name, school_id), school:schools(id)",
    )
    .eq("id", claims.sub)
    .maybeSingle();

  if (!profile) return null;

  // RLS hides the school AND its roles from a deactivated account or a
  // suspended school: such a user is still signed in (so pages can send them
  // to /deactivated or /suspended) but has no usable role.
  const accountDeactivated = profile.deactivated_at !== null;
  const schoolSuspended = !accountDeactivated && profile.school_id !== null && !profile.school;
  if (!profile.role && !schoolSuspended && !accountDeactivated) return null;
  const isPlatformOwner =
    profile.school_id === null && profile.role?.school_id === null && profile.role.key === "platform_owner";
  // A "platform_owner" key that fails that rule is never trusted (the DB forbids it too).
  if (profile.role?.key === "platform_owner" && !isPlatformOwner) return null;

  return {
    id: profile.id,
    email: typeof claims.email === "string" ? claims.email : null,
    fullName: profile.full_name,
    schoolId: profile.school_id,
    roleId: profile.role_id,
    roleKey: profile.role?.key ?? "",
    roleName: profile.role?.name ?? "",
    locale: profile.locale,
    mustChangePassword: profile.must_change_password,
    schoolSuspended,
    accountDeactivated,
    isPlatformOwner,
  };
});

/**
 * For protected pages: signed-in user with a profile, whose school is active,
 * and who has set their own password.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) return redirect({ href: "/login", locale: await getLocale() });
  const blocked = blockedPath(user);
  if (blocked) return redirect({ href: blocked, locale: await getLocale() });
  if (user.mustChangePassword) {
    return redirect({ href: "/change-password", locale: await getLocale() });
  }
  return user;
}

/** Where a signed-in user who has lost access must go, or null. */
export function blockedPath(user: CurrentUser): "/deactivated" | "/suspended" | null {
  if (user.accountDeactivated) return "/deactivated";
  if (user.schoolSuspended) return "/suspended";
  return null;
}

/**
 * Call at the top of EVERY page (not in layouts: layouts and pages render in
 * parallel, so a layout check does not stop the page). Wrong area → own home.
 */
export async function requireArea(area: Area): Promise<CurrentUser> {
  const user = await requireUser();
  if (areaFor(user) !== area) {
    return redirect({ href: homeFor(user), locale: await getLocale() });
  }
  return user;
}

/** Permission keys of the signed-in user's role (RLS: own school's roles only). */
export const getPermissions = cache(async (): Promise<Set<string>> => {
  const user = await getCurrentUser();
  if (!user?.schoolId) return new Set();

  const supabase = await createClient();
  const { data } = await supabase
    .from("role_permissions")
    .select("permission_key")
    .eq("role_id", user.roleId);

  return new Set((data ?? []).map((row) => row.permission_key));
});

export type CurrentSchool = { id: string; name: string; logoUrl: string | null };

/** The signed-in user's school (null for the platform owner). */
export const getCurrentSchool = cache(async (): Promise<CurrentSchool | null> => {
  const user = await getCurrentUser();
  if (!user?.schoolId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("schools")
    .select("id, name, logo_url")
    .eq("id", user.schoolId)
    .maybeSingle();

  return data ? { id: data.id, name: data.name, logoUrl: data.logo_url } : null;
});
