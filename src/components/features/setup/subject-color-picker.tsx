"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { KeyboardEvent } from "react";

import { SUBJECT_COLORS, SUBJECT_SWATCH, type SubjectColor } from "@/lib/structure/subject-template";
import { cn } from "@/lib/utils";

type Props = { value: SubjectColor; onChange: (color: SubjectColor) => void; labelledBy: string };

/** Colour swatches as a radio group (arrow keys move, each swatch has its colour name). */
export function SubjectColorPicker({ value, onChange, labelledBy }: Props) {
  const t = useTranslations("setup.subjects.colors");

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    // In RTL the visual order is mirrored: the right arrow goes back.
    const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
    const horizontal = e.key === "ArrowRight" || e.key === "ArrowLeft";
    const delta = rtl && horizontal ? -step : step;
    const i = (SUBJECT_COLORS.indexOf(value) + delta + SUBJECT_COLORS.length) % SUBJECT_COLORS.length;
    onChange(SUBJECT_COLORS[i]);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-color="${SUBJECT_COLORS[i]}"]`)?.focus();
  }

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2" onKeyDown={onKeyDown}>
      {SUBJECT_COLORS.map((color) => {
        const selected = color === value;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(color)}
            title={t(color)}
            data-color={color}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(color)}
            className={cn(
              "flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring",
              SUBJECT_SWATCH[color],
              selected && "ring-2 ring-foreground",
            )}
          >
            {selected && <Check aria-hidden className="size-4 text-background" />}
          </button>
        );
      })}
    </div>
  );
}
