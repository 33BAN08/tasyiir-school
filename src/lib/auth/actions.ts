"use server";

import { hasLocale } from "next-intl";

import { redirect } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { passwordSignIn } from "@/lib/auth/password-sign-in";
import { getCurrentUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema, loginSchema } from "@/lib/validations/auth";

/** `error` is a next-intl key under `auth.errors`. */
export type AuthActionResult = { ok: false; error: string };

/**
 * Only same-site relative paths; blocks open redirects like `//evil.com`.
 * "/" is the public home page: signed in, a user goes to their area (/start).
 */
function safeNext(next: unknown): string {
  return typeof next === "string" && next !== "/" && /^\/(?![/\\])/.test(next) ? next : "/start";
}

/** Server Actions cannot read the [locale] segment: the client passes it in. */
function safeLocale(locale: unknown): Locale {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

export async function signIn(
  input: unknown,
  next: unknown,
  locale: unknown,
): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "generic" };
  }

  const supabase = await createClient();
  const { user, error } = await passwordSignIn(supabase, parsed.data);

  if (error || !user) {
    if (error?.code === "invalid_credentials") return { ok: false, error: "invalidCredentials" };
    // Deactivated accounts are also banned in Supabase Auth.
    if (error?.code === "user_banned") return { ok: false, error: "accountDeactivated" };
    if (error?.status === 429) return { ok: false, error: "tooManyAttempts" };
    return { ok: false, error: "generic" };
  }

  // Accounts are created by admins together with a profile. No profile = no access.
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password, deactivated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return { ok: false, error: "noAccess" };
  }
  if (profile.deactivated_at) {
    await supabase.auth.signOut();
    return { ok: false, error: "accountDeactivated" };
  }

  return redirect({
    href: profile.must_change_password ? "/change-password" : safeNext(next),
    locale: safeLocale(locale),
  });
}

export async function changePassword(input: unknown, locale: unknown): Promise<AuthActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "sessionExpired" };
  if (user.isDemo) return { ok: false, error: "demoLocked" };

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "generic" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    if (error.code === "same_password") return { ok: false, error: "samePassword" };
    if (error.code === "weak_password") return { ok: false, error: "weakPassword" };
    return { ok: false, error: "generic" };
  }

  // Users cannot write this column themselves (column grants): use the secret key.
  const admin = createAdminClient();
  const { error: profileError } = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  if (profileError) return { ok: false, error: "generic" };

  return redirect({ href: "/start", locale: safeLocale(locale) });
}

export async function signOut(locale: unknown): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: "/login", locale: safeLocale(locale) });
}
