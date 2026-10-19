import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Input / select / textarea look of the demo form (44 px tall, 3:1 border). */
export const CONTROL = cn(
  "w-full min-h-11 rounded-lg border border-lp-field bg-lp-surface px-3 py-2 text-base text-lp-ink outline-none",
  "focus-visible:border-lp-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lp-brand",
  "aria-invalid:border-lp-absent aria-invalid:border-2",
);

export function fieldIds(name: string) {
  return { input: `demo-${name}`, hint: `demo-${name}-hint`, error: `demo-${name}-error` };
}

type Props = {
  name: string;
  label: string;
  hint?: string;
  /** Translated error message, shown under the field. */
  error?: string;
  children: ReactNode;
};

/** Label above, then the control, its hint and the error under it. */
export function DemoField({ name, label, hint, error, children }: Props) {
  const ids = fieldIds(name);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={ids.input} className="text-sm font-bold text-lp-ink">
        {label}
      </label>
      {children}
      {hint && (
        <p id={ids.hint} className="text-sm text-lp-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={ids.error} className="flex items-start gap-1.5 text-sm font-semibold text-lp-absent">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

/** aria-* wiring of a control: describedby = hint + error, invalid when in error. */
export function controlProps(name: string, error: string | undefined, hasHint = false) {
  const ids = fieldIds(name);
  const describedBy = [hasHint && ids.hint, error && ids.error].filter(Boolean).join(" ");
  return {
    id: ids.input,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy || undefined,
  } as const;
}
