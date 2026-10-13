import "server-only";

import type { z } from "zod";

import { logAudit } from "@/lib/audit";
import type { SchoolActor } from "@/lib/auth/school-actor";

// Shared by the structure Server Actions (years, levels, filières, …).

export type StructureActionResult<T, F extends string = never> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: F };

/** zod result → values, or the first issue as `{ error, field }` (error = `setup.errors` key). */
export function parseInput<S extends z.ZodType, F extends string>(
  schema: S,
  input: unknown,
): { values: z.output<S> } | { error: string; field?: F } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { values: parsed.data };
  const issue = parsed.error.issues[0];
  return { error: issue?.message ?? "generic", field: issue?.path[0] as F | undefined };
}

export function auditStructure(
  actor: SchoolActor,
  action: string,
  entity: string,
  entityId: string,
  data: Record<string, string | number | boolean | null>,
) {
  return logAudit({ actorId: actor.id, schoolId: actor.schoolId, action, entity, entityId, data });
}
