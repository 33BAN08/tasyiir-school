"use server";

import { getPoster } from "@/lib/announcements/poster";
import { logAudit } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";
import {
  announcementEditSchema,
  announcementIdSchema,
  announcementSchema,
} from "@/lib/validations/announcements";

// Announcements, written through RLS with the caller's session (the policies
// say who may post, edit or delete). Error keys: `announcements.errors`.

export type AnnouncementResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: "scope" | "title" | "body" | "audience" | "levelIds" | "classIds" };

type DbError = { code?: string; message: string };

function dbError(error: DbError): string {
  if (error.message.includes("announcement_no_current_year")) return "noCurrentYear";
  if (error.code === "42501") return "forbidden"; // RLS: not allowed (e.g. a class the teacher does not teach)
  return "failed";
}

function fieldOf(path: PropertyKey | undefined) {
  return path === "scope" || path === "title" || path === "body" || path === "audience" || path === "levelIds" || path === "classIds"
    ? path
    : undefined;
}

export async function createAnnouncement(input: unknown): Promise<AnnouncementResult<{ id: string }>> {
  const poster = await getPoster();
  if (!poster) return { ok: false, error: "forbidden" };
  const parsed = announcementSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: fieldOf(issue?.path[0]) };
  }
  const v = parsed.data;
  // Only the picks that match the scope are sent: the database checks the same.
  const { data, error } = await (await createClient()).rpc("create_announcement", {
    p_scope: v.scope,
    p_audience: v.audience,
    p_title: v.title,
    p_body: v.body,
    p_level_ids: v.scope === "levels" ? v.levelIds : [],
    p_class_ids: v.scope === "classes" ? v.classIds : [],
  });
  if (error || !data) return { ok: false, error: error ? dbError(error) : "failed" };

  await logAudit({
    actorId: poster.id,
    schoolId: poster.schoolId,
    action: "announcement.create",
    entity: "announcement",
    entityId: data,
    data: { scope: v.scope, audience: v.audience, title: v.title },
  });
  return { ok: true, data: { id: data } };
}

export async function updateAnnouncement(id: unknown, input: unknown): Promise<AnnouncementResult> {
  const poster = await getPoster();
  if (!poster) return { ok: false, error: "forbidden" };
  const key = announcementIdSchema.safeParse(id);
  if (!key.success) return { ok: false, error: "notFound" };
  const parsed = announcementEditSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "invalid", field: fieldOf(issue?.path[0]) };
  }

  const { data, error } = await (await createClient())
    .from("announcements")
    .update({ title: parsed.data.title, body: parsed.data.body })
    .eq("id", key.data)
    .eq("school_id", poster.schoolId)
    .select("id");
  if (error) return { ok: false, error: dbError(error) };
  if (data.length === 0) return { ok: false, error: "notFound" }; // not yours, or gone

  await logAudit({
    actorId: poster.id,
    schoolId: poster.schoolId,
    action: "announcement.update",
    entity: "announcement",
    entityId: key.data,
    data: { title: parsed.data.title },
  });
  return { ok: true, data: null };
}

export async function deleteAnnouncement(id: unknown): Promise<AnnouncementResult> {
  const poster = await getPoster();
  if (!poster) return { ok: false, error: "forbidden" };
  const key = announcementIdSchema.safeParse(id);
  if (!key.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("announcements")
    .delete()
    .eq("id", key.data)
    .eq("school_id", poster.schoolId)
    .select("title");
  if (error) return { ok: false, error: dbError(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await logAudit({
    actorId: poster.id,
    schoolId: poster.schoolId,
    action: "announcement.delete",
    entity: "announcement",
    entityId: key.data,
    data: { title: data[0].title },
  });
  return { ok: true, data: null };
}

/** Opening an announcement reads its notification (own rows only: UPDATE(read_at) + RLS). */
export async function markAnnouncementSeen(id: unknown): Promise<void> {
  const key = announcementIdSchema.safeParse(id);
  if (!key.success) return;
  await (await createClient())
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("type", "announcement")
    .eq("data->>announcement_id", key.data)
    .is("read_at", null);
}
