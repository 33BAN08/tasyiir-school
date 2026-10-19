import { Check, Clock, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type DemoStatus = "present" | "absent" | "late";

const STYLE: Record<DemoStatus, { icon: typeof Check; className: string }> = {
  present: { icon: Check, className: "bg-lp-tint text-lp-brand" },
  absent: { icon: X, className: "bg-lp-absent-bg text-lp-absent" },
  late: { icon: Clock, className: "bg-lp-late-bg text-lp-late" },
};

/** Present / absent / late: always an icon and a word, never colour alone. */
export function StatusChip({ status, label, className }: { status: DemoStatus; label: string; className?: string }) {
  const { icon: Icon, className: tone } = STYLE[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition-colors duration-300 motion-reduce:transition-none",
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
