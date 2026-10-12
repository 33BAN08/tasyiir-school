"use client";

import { Lock } from "lucide-react";

import { useStaffError } from "../use-staff-error";

/** Why an action is not available here (same rule key as the server would return). */
export function BlockedNote({ reason }: { reason: string }) {
  const translateError = useStaffError();
  return (
    <p className="flex items-start gap-2 text-sm text-muted-foreground">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
      {translateError(reason)}
    </p>
  );
}
