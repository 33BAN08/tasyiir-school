"use server";

import { z } from "zod";

import { areaFor } from "@/lib/auth/roles";
import { blockedPath, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// This phone's web-push subscription (Phase 10 step 3), with the parent's own
// session: save_push_subscription() takes the school and account from it and
// refuses anyone who is not a parent; RLS lets a parent delete only their own rows.

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
