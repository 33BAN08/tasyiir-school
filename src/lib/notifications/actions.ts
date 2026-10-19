"use server";

import { z } from "zod";

import { blockedPath, getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Marking your own notifications as read, with your own session: the table
// grants UPDATE on read_at only and RLS limits it to your own rows, so a
// forged id of someone else's notification changes nothing.

type Result = { ok: true } | { ok: false; error: "forbidden" | "invalid" | "failed" };

async function signedIn() {
  const user = await getCurrentUser();
  return user && !user.mustChangePassword && !blockedPath(user) && (user.schoolId || user.isPlatformOwner) ? user : null;
}

export async function markNotificationRead(id: unknown): Promise<Result> {
  if (!(await signedIn())) return { ok: false, error: "forbidden" };
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .is("read_at", null);
  return error ? { ok: false, error: "failed" } : { ok: true };
}

export async function markAllNotificationsRead(): Promise<Result> {
  if (!(await signedIn())) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  return error ? { ok: false, error: "failed" } : { ok: true };
}
