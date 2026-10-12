import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export type AuditEntry = {
  actorId: string;
  /** null = platform-level action. */
  schoolId: string | null;
  /** Dotted verb, e.g. `school.suspend`. */
  action: string;
  entity?: string;
  entityId?: string;
  data?: Json;
};

/**
 * Appends to `audit_logs` (append-only: users have no write grant, so this
 * uses the secret key). Never throws: a failed log must not undo the action
 * that already happened, so the error is only reported to the server log.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const { error } = await createAdminClient()
    .from("audit_logs")
    .insert({
      actor_id: entry.actorId,
      school_id: entry.schoolId,
      action: entry.action,
      entity: entry.entity ?? null,
      entity_id: entry.entityId ?? null,
      data: entry.data ?? {},
    });

  if (error) console.error("audit log failed", entry.action, error.code);
}
