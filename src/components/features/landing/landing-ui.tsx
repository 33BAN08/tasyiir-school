import type { ComponentProps, ReactNode } from "react";

import { BRAND, BRAND_ASSETS } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Page width + side gutters (16 px on phones). */
export const WRAP = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";

const FOCUS = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2";

/** 44 px tall buttons/links. `onDark` = on the dark green bands. */
export const BUTTON = {
  primary: cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-lp-brand px-5 text-base font-bold text-lp-on-brand hover:bg-lp-brand-hover focus-visible:outline-lp-brand",
    FOCUS,
  ),
  outline: cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-lp-brand bg-lp-surface px-5 text-base font-bold text-lp-brand hover:bg-lp-tint focus-visible:outline-lp-brand",
    FOCUS,
  ),
  light: cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-lp-surface px-5 text-base font-bold text-lp-brand hover:bg-lp-tint focus-visible:outline-lp-on-brand",
    FOCUS,
  ),
  outlineOnDark: cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-lp-band-muted px-5 text-base font-bold text-lp-on-brand hover:bg-lp-band-2 focus-visible:outline-lp-on-brand",
    FOCUS,
  ),
  whatsapp: cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-lp-whatsapp px-5 text-base font-bold text-lp-ink hover:brightness-95 focus-visible:outline-lp-brand",
    FOCUS,
  ),
  link: cn("rounded-sm font-semibold text-lp-brand underline-offset-4 hover:underline focus-visible:outline-lp-brand", FOCUS),
} as const;

/** Full Madar logo; `onDark` = the white-lettered version for the green bands. */
export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG, nothing to optimize
    <img
      src={onDark ? BRAND_ASSETS.logoDark : BRAND_ASSETS.logo}
      alt={BRAND.product}
      width={630}
      height={365}
      className={cn("h-12 w-auto", className)}
    />
  );
}

type SectionProps = Omit<ComponentProps<"section">, "title"> & {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  tone?: "plain" | "tint";
};

/** A page section with its heading (h2) and optional lead paragraph. */
export function Section({ id, title, subtitle, tone = "plain", className, children, ...props }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("py-16 sm:py-20", tone === "tint" && "bg-lp-tint", className)}
      {...props}
    >
      <div className={WRAP}>
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 id={`${id}-title`} className="text-3xl font-extrabold text-lp-brand-strong sm:text-4xl">
            {title}
          </h2>
          {subtitle && <p className="mt-3 text-lg text-lp-muted">{subtitle}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

/** Round icon badge used in lists and cards. */
export function IconBadge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn("flex size-11 shrink-0 items-center justify-center rounded-full bg-lp-tint text-lp-brand", className)}
    >
      {children}
    </span>
  );
}

/** "Bientôt" tag for features not built yet. */
export function SoonBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-lp-info-bg px-2 py-0.5 text-xs font-bold text-lp-info">
      <span aria-hidden className="size-1.5 rounded-full bg-lp-sand" />
      {label}
    </span>
  );
}
