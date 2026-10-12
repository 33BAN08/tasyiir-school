"use server";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema, loginSchema } from "@/lib/validations/auth";

/** `error` is a next-intl key under `auth.errors`. */
export type AuthActionResult = { ok: false; error: string };

/** Only same-site relative paths; blocks open redirects like `//evil.com`. */
function safeNext(next: unknown): string {
  return typeof next === "string" && /^\/(?![/\\])/.test(next) ? next : "/";
}

export async function signIn(input: unknown, next?: unknown): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "generic" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    if (error?.code === "invalid_credentials") return { ok: false, error: "invalidCredentials" };
    if (error?.status === 429) return { ok: false, error: "tooManyAttempts" };
    return { ok: false, error: "generic" };
  }

  // Accounts are created by admins together with a profile. No profile = no access.
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return { ok: false, error: "noAccess" };
  }

  redirect(profile.must_change_password ? "/change-password" : safeNext(next));
}

export async function changePassword(input: unknown): Promise<AuthActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "sessionExpired" };

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

  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
