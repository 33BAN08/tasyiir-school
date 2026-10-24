"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { areaFor } from "@/lib/auth/roles";
import { blockedPath, getCurrentUser } from "@/lib/auth/session";
import { routing } from "@/i18n/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { sendToPhone, vapidReady } from "./deliver";

// This phone's web-push subscription (Phase 10 step 3), with the parent's own
// session: save_push_subscription() takes the school and account from it and
// refuses anyone who is not a parent; RLS lets a parent delete only their own rows.
// Step 5: the parent's switches (save_push_preferences) and a test push to this phone.

type Result = { ok: true } | { ok: false; error: "forbidden" | "invalid" | "failed" };

/** What the browser's PushSubscription.toJSON() gives. */
const subscriptionSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

async function parent() {
  const user = await getCurrentUser();
  return user && !user.mustChangePassword && !blockedPath(user) && areaFor(user) === "portal" ? user : null;
}

export async function savePushSubscription(input: unknown, userAgent: unknown): Promise<Result> {
  if (!(await parent())) return { ok: false, error: "forbidden" };
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
    p_user_agent: typeof userAgent === "string" ? userAgent.slice(0, 300) : undefined,
  });
  if (error) return { ok: false, error: error.code === "42501" ? "forbidden" : "failed" };
  return { ok: true };
}

export async function removePushSubscription(endpoint: unknown): Promise<Result> {
  if (!(await parent())) return { ok: false, error: "forbidden" };
  const parsed = z.url().max(1000).safeParse(endpoint);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data);
  return error ? { ok: false, error: "failed" } : { ok: true };
}

const preferencesSchema = z.object({ absences: z.boolean(), remarks: z.boolean(), announcements: z.boolean() });

/** Which kinds of notification reach this parent's phones (all of them on by default). */
export async function savePushPreferences(input: unknown): Promise<Result> {
  if (!(await parent())) return { ok: false, error: "forbidden" };
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_push_preferences", {
    p_absences: parsed.data.absences,
    p_remarks: parsed.data.remarks,
    p_announcements: parsed.data.announcements,
  });
  if (error) return { ok: false, error: error.code === "42501" ? "forbidden" : "failed" };
  return { ok: true };
}

type TestResult = { ok: true } | { ok: false; error: "forbidden" | "invalid" | "notFound" | "gone" | "failed" };

/**
 * "Tester": one push straight to this phone, in the page's language, whatever the
 * switches say. Only the parent's own subscription (the keys are read with the
 * secret key, as the sender does); a phone the push service no longer knows is removed.
 */
export async function sendTestPush(endpoint: unknown, locale: unknown): Promise<TestResult> {
  const user = await parent();
  if (!user) return { ok: false, error: "forbidden" };
  const parsed = z.url({ protocol: /^https$/ }).max(1000).safeParse(endpoint);
  const lang = routing.locales.find((l) => l === locale);
  if (!parsed.success || !lang) return { ok: false, error: "invalid" };
  if (!vapidReady()) return { ok: false, error: "failed" };

  const admin = createAdminClient();
  const { data: phone } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("endpoint", parsed.data)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!phone) return { ok: false, error: "notFound" };

  const t = await getTranslations({ locale: lang, namespace: "push.test" });
  const result = await sendToPhone(phone, {
    title: t("title"),
    body: t("body"),
    url: `/${lang}/portal/notifications`,
    tag: "tasyir-test",
    lang,
  });
  if (result === "gone") {
    await admin.from("push_subscriptions").delete().eq("endpoint", phone.endpoint).eq("profile_id", user.id);
    return { ok: false, error: "gone" };
  }
  if (result === "failed") return { ok: false, error: "failed" };
  await admin.from("push_subscriptions").update({ last_success_at: new Date().toISOString(), failures: 0 }).eq("endpoint", phone.endpoint);
  return { ok: true };
}
