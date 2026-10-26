import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const TONES = {
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/10 text-info",
  brand: "bg-primary/10 text-primary",
} as const;

/** One headline number (today's tiles): icon, label, value, a small second line; the whole tile opens its page. */
export function StatTile({ icon: Icon, tone, label, value, sub, href, name }: {
  icon: LucideIcon;
  tone: keyof typeof TONES;
  label: string;
  value: string;
  sub?: string | null;
  href: string;
  name: string;
}) {
  const className = "flex min-h-28 flex-col gap-2 rounded-xl border bg-card p-4 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50";
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
          <Icon className="size-4" aria-hidden />
        </span>
        {label}
      </span>
      <span className="font-numeric text-3xl font-bold tabular-nums">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </>
  );
  // "#…" = a card of this page (a locale-aware Link would load another page).
  return href.startsWith("#") ? (
    <a href={href} data-dashboard-tile={name} data-value={value} className={className}>{body}</a>
  ) : (
    <Link href={href} data-dashboard-tile={name} data-value={value} className={className}>{body}</Link>
  );
}

/** A dashboard card: title (+ a "see all" link) and its content; `className` places it in the grid. */
export function DashCard({ title, name, action, className, children }: {
  title: string;
  name: string;
  action?: { href: string; label: string };
  className?: string;
  children: ReactNode;
}) {
  return (
    <section data-dashboard-card={name} aria-labelledby={`dash-${name}`} className={cn("flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={`dash-${name}`} className="font-semibold">{title}</h2>
        {action && (
          <Link href={action.href} className="flex min-h-11 shrink-0 items-center gap-0.5 text-sm text-primary underline-offset-4 hover:underline md:min-h-0">
            {action.label}
            <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Bars of one hue (magnitude; a zero draws no bar), each row labelled with its exact value as text
 * (identity is the label, never the colour), thin, rounded ends; a row opens its page.
 */
export function BarList({ rows, name }: {
  rows: { key: string; label: string; value: number; display: string; sub?: string; href: string; max: number }[];
  name: string;
}) {
  return (
    <ul className="flex flex-col gap-2.5" data-bar-list={name}>
      {rows.map((r) => (
        <li key={r.key}>
          <Link href={r.href} data-bar-row={r.key} data-bar-value={r.value} className="group flex min-h-11 flex-col justify-center gap-1 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium group-hover:underline" dir="auto">{r.label}</span>
              <span className="shrink-0 font-numeric tabular-nums">
                {r.display}
                {r.sub && <span className="ms-1.5 text-xs text-muted-foreground">{r.sub}</span>}
              </span>
            </span>
            <span className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              <span className="block h-full rounded-full bg-primary" style={{ width: `${r.max > 0 && r.value > 0 ? Math.max(2, Math.round((r.value / r.max) * 100)) : 0}%` }} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
