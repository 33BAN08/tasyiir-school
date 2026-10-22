import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A drawn phone showing one app screen (demo data, fictional names). The
 * picture is aria-hidden: its figcaption says what it shows.
 */
export function PhoneFrame({ caption, children, className }: { caption: ReactNode; children: ReactNode; className?: string }) {
  return (
    <figure className={cn("flex w-[17rem] shrink-0 snap-center flex-col items-center gap-4", className)}>
      <div
        aria-hidden
        className="relative h-[35rem] w-full overflow-hidden rounded-[2.25rem] border-[6px] border-lp-ink bg-lp-bg shadow-xl"
      >
        <div className="flex h-6 items-center justify-center">
          <span className="h-1.5 w-16 rounded-full bg-lp-ink/80" />
        </div>
        <div className="flex h-[calc(100%-1.5rem)] flex-col text-lp-ink">{children}</div>
      </div>
      <figcaption className="max-w-[16rem] text-center text-sm text-lp-muted">{caption}</figcaption>
    </figure>
  );
}

/** The app's top bar: school logo initial + name, as in the school / portal shells. */
export function AppBar({ school }: { school: string }) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-lp-line bg-lp-surface px-3">
      <span className="flex size-6 items-center justify-center rounded-md bg-lp-brand text-[0.625rem] font-bold text-lp-on-brand">
        {school.slice(0, 1)}
      </span>
      <span className="truncate text-xs font-semibold">{school}</span>
    </div>
  );
}

/** Student initials as the app's avatar fallback. */
export function Initials({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join("");
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-lp-tint text-xs font-semibold text-lp-muted",
        className,
      )}
    >
      {initials}
    </span>
  );
}
