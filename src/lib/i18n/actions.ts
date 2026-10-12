"use server";

import { z } from "zod";

import { routing } from "@/i18n/routing";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const localeSchema = z.enum(routing.locales);

export type SaveLocaleResult = { ok: true } | { ok: false; error: string };

/** Remember the signed-in user's language (RLS: own row, `locale` column only). */
export async function saveLocalePreference(input: unknown): Promise<SaveLocaleResult> {
  const parsed = localeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "generic" };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "sessionExpired" };
  if (user.locale === parsed.data) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ locale: parsed.data })
    .eq("id", user.id);

  return error ? { ok: false, error: "generic" } : { ok: true };
}
