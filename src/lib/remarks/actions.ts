"use server";

import { logAudit } from "@/lib/audit";
import { areaFor } from "@/lib/auth/roles";
import { blockedPath, getCurrentUser } from "@/lib/auth/session";
import { getRemarkStaff } from "@/lib/remarks/writer";
import { createClient } from "@/lib/supabase/server";
import { remarkIdSchema, remarkSchema } from "@/lib/validations/remarks";
import { studentIdSchema } from "@/lib/validations/students";
import type { TablesInsert } from "@/types/database";

// Student remarks, written through RLS with the caller's session: the policies
// say who may write (attendance.manage, or a teacher for students they teach),
// change (the author, 24 h), delete (the author 24 h; the director /
// attendance.manage any) or mark read (the child's parents). The database logs
// every delete itself. Error keys: `remarks.errors`.

export type RemarkResult<T = null> = { ok: true; data: T } | { ok: false; error: string; field?: "type" | "body" };

type DbError = { code?: string; message: string };

function dbError(error: DbError): string {
  if (error.message.includes("remark_student_not_enrolled")) return "notEnrolled";
  if (error.message.includes("remark_locked")) return "locked";
  if (error.code === "42501" || error.message.includes("remark_read_parent_only")) return "forbidden";
  return "failed";
}

function parse(input: unknown) {
  const parsed = remarkSchema.safeParse(input);
  if (parsed.success) return { values: parsed.data };
  const issue = parsed.error.issues[0];
  const path = issue?.path[0];
  return { error: issue?.message ?? "invalid", field: path === "type" || path === "body" ? path : undefined } as const;
}

export async function createRemark(studentId: unknown, input: unknown): Promise<RemarkResult<{ id: string }>> {
  const staff = await getRemarkStaff();
  if (!staff?.canWrite) return { ok: false, error: "forbidden" };
  const student = studentIdSchema.safeParse(studentId);
  if (!student.success) return { ok: false, error: "notFound" };
  const v = parse(input);
  if ("error" in v) return { ok: false, error: v.error ?? "invalid", field: v.field };

  const { data, error } = await (await createClient())
    .from("student_remarks")
    // academic_year_id is set by the trigger (current year) and not granted: it is never sent.
    .insert({ school_id: staff.schoolId, student_id: student.data, type: v.values.type, body: v.values.body } as TablesInsert<"student_remarks">)
    .select("id")
    .single();
  if (error) return { ok: false, error: dbError(error) };

  await logAudit({
    actorId: staff.id,
    schoolId: staff.schoolId,
    action: "remark.create",
    entity: "student_remark",
    entityId: data.id,
    data: { student_id: student.data, type: v.values.type },
  });
  return { ok: true, data: { id: data.id } };
}

export async function updateRemark(remarkId: unknown, input: unknown): Promise<RemarkResult> {
  const staff = await getRemarkStaff();
  if (!staff?.canWrite) return { ok: false, error: "forbidden" };
  const id = remarkIdSchema.safeParse(remarkId);
  if (!id.success) return { ok: false, error: "notFound" };
  const v = parse(input);
  if ("error" in v) return { ok: false, error: v.error ?? "invalid", field: v.field };

  const { data, error } = await (await createClient())
    .from("student_remarks")
    .update({ type: v.values.type, body: v.values.body })
    .eq("id", id.data)
    .eq("school_id", staff.schoolId)
    .eq("created_by", staff.id) // only the author changes a remark (a parent's read goes through markRemarkRead)
    .select("id");
  if (error) return { ok: false, error: dbError(error) };
  if (data.length === 0) return { ok: false, error: "locked" }; // not theirs, gone, or past 24 h

  await logAudit({
    actorId: staff.id,
    schoolId: staff.schoolId,
    action: "remark.update",
    entity: "student_remark",
    entityId: id.data,
    data: { type: v.values.type },
  });
  return { ok: true, data: null };
}

/** The database writes the audit row (remark.delete / remark.moderate) itself. */
export async function deleteRemark(remarkId: unknown): Promise<RemarkResult> {
  const staff = await getRemarkStaff();
  if (!staff) return { ok: false, error: "forbidden" };
  const id = remarkIdSchema.safeParse(remarkId);
  if (!id.success) return { ok: false, error: "notFound" };

  const { data, error } = await (await createClient())
    .from("student_remarks")
    .delete()
    .eq("id", id.data)
    .eq("school_id", staff.schoolId)
    .select("id");
  if (error) return { ok: false, error: dbError(error) };
  if (data.length === 0) return { ok: false, error: staff.canModerate ? "notFound" : "locked" };
  return { ok: true, data: null };
}

/** A parent marks a remark read ("Lu"); its notification is read too. */
export async function markRemarkRead(remarkId: unknown): Promise<RemarkResult> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword || blockedPath(user) || areaFor(user) !== "portal") return { ok: false, error: "forbidden" };
  const id = remarkIdSchema.safeParse(remarkId);
  if (!id.success) return { ok: false, error: "notFound" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_remarks")
    .update({ read_at: new Date().toISOString() }) // the database keeps the first read time
    .eq("id", id.data)
    .select("id");
  if (error) return { ok: false, error: dbError(error) };
  if (data.length === 0) return { ok: false, error: "notFound" };

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("type", "remark")
    .eq("data->>remark_id", id.data)
    .is("read_at", null);
  return { ok: true, data: null };
}
