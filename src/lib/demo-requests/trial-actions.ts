"use server";

import { randomInt } from "node:crypto";

import { getTranslations } from "next-intl/server";
import { refresh } from "next/cache";
import { hasLocale } from "next-intl";
import { z } from "zod";

import { routing } from "@/i18n/routing";
import { schoolClock } from "@/lib/attendance/clock";
import { logAudit } from "@/lib/audit";
import { SITE_URL } from "@/lib/brand";
import { addDays } from "@/lib/dates";
import { TRIAL } from "@/lib/demo-requests/trial";
import { getPlatformOwner } from "@/lib/platform/guard";
import { provisionSchool, ProvisionError } from "@/lib/platform/provision";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CreateTrialResult =
  | {
      ok: true;
      data: { schoolId: string; email: string; password: string; lastDay: string; whatsappUrl: string };
    }
  | { ok: false; error: "forbidden" | "notFound" | "alreadyCreated" | "emailTaken" | "generic" };

/** "École Al Amal – Rabat" → "ecole-al-amal-rabat-k3f9" (unique enough; slugTaken is retried once). */
function trialSlug(schoolName: string): string {
  const base = schoolName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  const suffix = Array.from({ length: 4 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[randomInt(31)]).join("");
  return `${base || "ecole"}-${suffix}`;
}

/** 8 letters + 4 digits, no look-alike characters (read aloud or typed from WhatsApp). */
function temporaryPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
  const word = Array.from({ length: 8 }, () => letters[randomInt(letters.length)]).join("");
  return `${word}${randomInt(1000, 10000)}`;
}

/**
 * End of `date` at the school, as a UTC instant. The offset comes from the
 * database's clock (Node's Morocco time-zone data is outdated).
 */
async function endOfSchoolDay(date: string): Promise<string> {
  const now = new Date();
  const clock = await schoolClock(now.toISOString());
  const local = Date.parse(`${clock.date}T${clock.time}:00Z`);
  const offset = Math.round((local - now.getTime()) / (15 * 60_000)) * 15; // minutes, to the quarter hour
  return new Date(Date.parse(`${date}T23:59:59Z`) - offset * 60_000).toISOString();
}

/**
 * "Créer l'essai" on a trial request of the platform inbox: the school, its
 * director (temporary password, changed at first sign-in) and a 14-day "pro"
 * trial capped at 50 students, all or nothing (provisionSchool). The request is
 * then linked to the school and marked handled. The password is returned ONCE,
 * with a WhatsApp link that sends it to the requester in their language.
 */
export async function createTrialFromRequest(requestId: unknown): Promise<CreateTrialResult> {
  const owner = await getPlatformOwner();
  if (!owner) return { ok: false, error: "forbidden" };
  const id = z.uuid().safeParse(requestId);
  if (!id.success) return { ok: false, error: "notFound" };

  // Read with the owner's own session (RLS: platform owner only).
  const supabase = await createClient();
  const { data: request } = await supabase
    .from("demo_requests")
    .select("id, kind, full_name, school_name, city, phone, email, locale, school_id")
    .eq("id", id.data)
    .maybeSingle();
  if (!request || request.kind !== "trial" || !request.email) return { ok: false, error: "notFound" };
  if (request.school_id) return { ok: false, error: "alreadyCreated" };

  const admin = createAdminClient();
  const { data: plan } = await admin.from("plans").select("id").eq("key", TRIAL.planKey).maybeSingle();
  if (!plan) return { ok: false, error: "generic" };

  const today = (await schoolClock()).date;
  const lastDay = addDays(today, TRIAL.days);
  const locale = hasLocale(routing.locales, request.locale) ? request.locale : routing.defaultLocale;
  const password = temporaryPassword();

  let created: { schoolId: string; directorId: string } | null = null;
  for (let attempt = 0; attempt < 2 && !created; attempt++) {
    try {
      created = await provisionSchool(admin, {
        school: { name: request.school_name, slug: trialSlug(request.school_name), city: request.city, phone: request.phone, address: null },
        director: { email: request.email, password, fullName: request.full_name, locale },
        subscription: {
          planId: plan.id,
          status: "trial",
          startDate: today,
          endDate: null,
          trialEndsAt: await endOfSchoolDay(lastDay),
          maxStudentsOverride: TRIAL.maxStudents,
        },
      });
    } catch (error) {
      if (error instanceof ProvisionError && error.key === "slugTaken" && attempt === 0) continue;
      if (error instanceof ProvisionError && error.key === "emailTaken") return { ok: false, error: "emailTaken" };
      console.error("createTrialFromRequest failed", (error as { code?: string }).code ?? "unknown");
      return { ok: false, error: "generic" };
    }
  }
  if (!created) return { ok: false, error: "generic" };

  // Link the request to its school (secret key: no grant on school_id), then mark it
  // handled with the owner's session so the trigger records who handled it.
  await admin.from("demo_requests").update({ school_id: created.schoolId }).eq("id", request.id);
  await supabase.from("demo_requests").update({ handled_at: new Date().toISOString() }).eq("id", request.id);

  await logAudit({
    actorId: owner.id,
    schoolId: created.schoolId,
    action: "school.create_trial",
    entity: "school",
    entityId: created.schoolId,
    // Never the password.
    data: { request_id: request.id, director_id: created.directorId, director_email: request.email, last_day: lastDay },
  });

  const t = await getTranslations({ locale, namespace: "platform.trial" });
  const message = t("whatsappMessage", {
    name: request.full_name,
    school: request.school_name,
    date: lastDay.split("-").reverse().join("/"),
    url: `${SITE_URL}/${locale}/login`,
    email: request.email,
    password,
  });
  refresh();
  return {
    ok: true,
    data: {
      schoolId: created.schoolId,
      email: request.email,
      password,
      lastDay,
      whatsappUrl: `https://wa.me/${request.phone.slice(1)}?text=${encodeURIComponent(message)}`,
    },
  };
}
