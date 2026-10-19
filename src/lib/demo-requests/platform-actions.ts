"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { logAudit } from "@/lib/audit";
import { getPlatformOwner } from "@/lib/platform/guard";
import { createClient } from "@/lib/supabase/server";

export type DemoHandledResult = { ok: true } | { ok: false; error: "forbidden" | "generic" };

/**
 * Mark a demo request handled (or back to "to handle"). The platform owner's
 * own session: the column grant (handled_at) + RLS (platform owner) decide;
 * the trigger records who handled it.
 */
export async function setDemoRequestHandled(id: unknown, handled: unknown): Promise<DemoHandledResult> {
  const owner = await getPlatformOwner();
  if (!owner) return { ok: false, error: "forbidden" };
  const parsed = z.object({ id: z.uuid(), handled: z.boolean() }).safeParse({ id, handled });
  if (!parsed.success) return { ok: false, error: "generic" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("demo_requests")
    .update({ handled_at: parsed.data.handled ? new Date().toISOString() : null })
    .eq("id", parsed.data.id)
    .select("id");
  if (error || data.length === 0) return { ok: false, error: "generic" };

  await logAudit({
    actorId: owner.id,
    schoolId: null,
    action: parsed.data.handled ? "demo_request.handle" : "demo_request.reopen",
    entity: "demo_requests",
    entityId: parsed.data.id,
  });
  refresh();
  return { ok: true };
}
