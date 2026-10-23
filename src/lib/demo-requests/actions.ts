"use server";

import { createClient } from "@supabase/supabase-js";
import { hasLocale } from "next-intl";

import { routing } from "@/i18n/routing";
import { normalizeMobile } from "@/lib/parents/phone";
import { demoRequestSchema } from "@/lib/validations/demo-request";
import type { Database } from "@/types/database";

/**
 * `error` is a `landing.demo.errors` key; `field` the form field it belongs to.
 * `limited` = a database limit was hit (not an error for the visitor: the form
 * answers kindly and offers WhatsApp): "phone" = this number already sent 3
 * requests in 24 h (we have them), "busy" = 30 requests in the last hour overall.
 */
export type DemoRequestResult =
  | { ok: true; data: { phone: string } }
  | { ok: false; limited: "phone" | "busy" }
  | { ok: false; error: string; field?: string };

/**
 * The home page's "Demander une démo" / "Essai gratuit" form (public: no session needed).
 * Always inserted as an anonymous visitor (publishable key, no cookies), so the
 * grant is anon INSERT only — even a signed-in visitor cannot read requests back.
 * The database enforces the limits (same phone 3 / 24 h, 30 / hour overall) and
 * notifies the platform owner.
 */
export async function requestDemo(input: unknown, locale: unknown): Promise<DemoRequestResult> {
  const parsed = demoRequestSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "generic", field: issue?.path[0]?.toString() };
  }
  const values = parsed.data;
  const phone = normalizeMobile(values.phone)!;

  // Honeypot filled: a bot. Answer as if it worked, store nothing.
  if (values.website !== "") return { ok: true, data: { phone } };

  const anon = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  // No .select(): anon has no SELECT, so the insert must not return the row.
  const { error } = await anon.from("demo_requests").insert({
    kind: values.kind,
    full_name: values.fullName,
    school_name: values.schoolName,
    city: values.city,
    phone,
    email: values.email || null,
    students: values.students,
    message: values.message || null,
    locale: hasLocale(routing.locales, locale) ? locale : routing.defaultLocale,
  });

  if (error) {
    if (error.message === "demo_rate_limited") {
      return { ok: false, limited: error.hint === "phone" ? "phone" : "busy" };
    }
    return { ok: false, error: "generic" };
  }
  return { ok: true, data: { phone } };
}
