import "server-only";

import { createTranslator } from "next-intl";
import webpush from "web-push";

import { SITE_URL } from "@/lib/brand";
import { describeNotification } from "@/lib/notifications/describe";
import type { NotificationData, NotificationType } from "@/lib/notifications/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StudentNames } from "@/lib/students/names";

// Phase 10 step 4: sends the parents' waiting pushes. The database queues a row in
// push_outbox for each parent notification with a subscribed phone and wakes
// /api/push/deliver; this takes the rows (push_claim), writes each sentence in the
// parent's language with the same describer as the list, sends it to every phone of
// that parent and reports back (push_done: phones the push service says are gone are
// removed, others count a failure). Secret key: the queue has no grant at all.

const LOCALES = ["ar", "fr", "en"] as const;
type Locale = (typeof LOCALES)[number];

const BATCH = 100;
/** Stop taking new rows after this long (a Vercel function has more, but a kick comes every minute). */
const BUDGET_MS = 20_000;

type Claimed = {
  outbox_id: number;
  notification_id: string;
  type: string;
  data: unknown;
  student_id: string | null;
  student: unknown;
  locale: string;
  subscriptions: unknown;
};
type Subscription = { endpoint: string; p256dh: string; auth: string };

export type DeliverResult = { rows: number; sent: number; gone: number; failed: number };

const translators = new Map<Locale, (key: string, values?: Record<string, string | number>) => string>();
async function translator(locale: Locale) {
  let t = translators.get(locale);
  if (!t) {
    const messages = (await import(`../../messages/${locale}.json`)).default;
    const translate = createTranslator({ locale, messages, namespace: "notifications" });
    t = (key, values) => translate(key as never, values as never);
    translators.set(locale, t);
  }
  return t;
}

/** The text a phone shows and the page a tap opens (in the parent's language). */
export async function pushPayload(row: Claimed) {
  const locale: Locale = (LOCALES as readonly string[]).includes(row.locale) ? (row.locale as Locale) : "ar";
  const t = await translator(locale);
  const { title, body, href } = describeNotification(
    {
      type: row.type as NotificationType,
      studentId: row.student_id,
      student: (row.student as StudentNames | null) ?? null,
      data: (row.data ?? {}) as NotificationData,
    },
    { t, locale, area: "portal" },
  );
  return { title, body, url: `/${locale}${href ?? "/portal/notifications"}`, tag: row.notification_id, lang: locale };
}

export function vapidReady() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export async function deliverPushes(): Promise<DeliverResult> {
  const admin = createAdminClient();
  const vapidDetails = {
    // Push services want an https: contact address (a local http one is refused).
    subject: SITE_URL.startsWith("https://") ? SITE_URL : "https://tasyiir-school.vercel.app",
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    privateKey: process.env.VAPID_PRIVATE_KEY!,
  };
  const total: DeliverResult = { rows: 0, sent: 0, gone: 0, failed: 0 };
  const started = Date.now();

  while (Date.now() - started < BUDGET_MS) {
    const { data, error } = await admin.rpc("push_claim", { p_limit: BATCH });
    if (error) throw new Error(`push_claim failed (${error.code})`);
    const rows = (data ?? []) as Claimed[];
    if (rows.length === 0) break;

    const ok = new Set<string>();
    const gone = new Set<string>();
    const failed = new Set<string>();
    await Promise.all(
      rows.map(async (row) => {
        const payload = JSON.stringify(await pushPayload(row));
        for (const s of (row.subscriptions ?? []) as Subscription[]) {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
              vapidDetails,
              TTL: 24 * 3600,
              urgency: "high",
              timeout: 10_000,
            });
            ok.add(s.endpoint);
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            (status === 404 || status === 410 ? gone : failed).add(s.endpoint);
          }
        }
      }),
    );

    const done = await admin.rpc("push_done", {
      p_outbox: rows.map((r) => r.outbox_id),
      p_ok: [...ok],
      p_gone: [...gone],
      p_failed: [...failed].filter((e) => !ok.has(e)),
    });
    if (done.error) throw new Error(`push_done failed (${done.error.code})`);
    total.rows += rows.length;
    total.sent += ok.size;
    total.gone += gone.size;
    total.failed += failed.size;
    if (rows.length < BATCH) break;
  }
  return total;
}
