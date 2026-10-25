"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

import { BUTTON } from "./landing-ui";

type Props = {
  className?: string;
  links: { href: string; label: string }[];
  /** "#demo" on the home page, "/fr#demo" elsewhere. */
  demoHref?: string;
  labels: { menu: string; close: string; nav: string; login: string; demo: string };
  /** The language links (server-rendered). */
  children: ReactNode;
  /** The header is the green zellige band (home page): a white menu button. */
  onDark?: boolean;
};

/** Phones and tablets: the header's links in a panel under the header. */
export function MobileMenu({ className, links, demoHref = "#demo", labels, children, onDark = false }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className={className}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? labels.close : labels.menu}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex size-11 items-center justify-center rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-2",
          onDark
            ? "text-lp-on-brand hover:bg-lp-band-2 focus-visible:outline-lp-on-brand"
            : "text-lp-ink hover:bg-lp-tint focus-visible:outline-lp-brand",
        )}
      >
        {open ? <X className="size-6" aria-hidden /> : <Menu className="size-6" aria-hidden />}
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-lp-line bg-lp-bg shadow-lg"
      >
        <nav aria-label={labels.nav} className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6">
          <ul className="flex flex-col">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={close}
                  className="flex min-h-11 items-center rounded-lg px-3 text-base font-semibold text-lp-ink outline-none hover:bg-lp-tint focus-visible:outline-2 focus-visible:outline-lp-brand"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-lp-line pt-3">
            {children}
            <div className="flex flex-wrap gap-2">
              <Link href="/login" className={cn(BUTTON.outline)}>
                {labels.login}
              </Link>
              <a href={demoHref} onClick={close} className={BUTTON.primary}>
                {labels.demo}
              </a>
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}
