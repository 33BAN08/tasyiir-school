"use client";

import { ArrowDown, ArrowUp, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SUBJECT_SWATCH, type SubjectColor } from "@/lib/structure/subject-template";
import { cn } from "@/lib/utils";

import { parseCoefficient, parseControls, type GridView } from "./grid-model";

type Props = {
  subject: { id: string; name: string; color: SubjectColor };
  view: GridView;
  canManage: boolean;
  onUp: (() => void) | null;
  onDown: (() => void) | null;
  /** The same value in every level column of the row (common columns). */
  onSameForAll: (value: string) => void;
};

/** First (sticky) column: subject name, report card order, "same value for all levels". */
export function GridSubjectCell({ subject, view, canManage, onUp, onDown, onSameForAll }: Props) {
  const t = useTranslations("grading.grid");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const parsed = view === "coefficients" ? parseCoefficient(value) : parseControls(value);
  const valid = parsed !== "invalid" && parsed !== null;

  function apply() {
    if (!valid) return;
    onSameForAll(value.trim());
    setOpen(false);
    setValue("");
  }

  return (
    <th
      scope="row"
      data-subject={subject.id}
      className="sticky start-0 z-10 bg-card px-2 py-1.5 text-start font-normal shadow-[inset_-1px_0_0_var(--color-border)] rtl:shadow-[inset_1px_0_0_var(--color-border)]"
    >
      {/* Phones: the name on its own line(s), the buttons under it; wider screens: one line. */}
      <div className="flex w-32 flex-col gap-0.5 sm:w-56 sm:flex-row sm:items-center sm:gap-1">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className={cn("size-2.5 shrink-0 rounded-full", SUBJECT_SWATCH[subject.color])} aria-hidden />
          {/* dir="auto": a Latin name in the Arabic page is cut at its end, not its start. */}
          <span dir="auto" className="line-clamp-2 text-sm font-medium break-words sm:truncate" title={subject.name}>
            {subject.name}
          </span>
        </span>
        {canManage && (
          <div className="-ms-1.5 flex shrink-0 items-center sm:ms-0">
            <Button variant="ghost" size="icon" className="size-7" onClick={onUp ?? undefined} disabled={!onUp}
              aria-label={t("moveUp", { subject: subject.name })}>
              <ArrowUp aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={onDown ?? undefined} disabled={!onDown}
              aria-label={t("moveDown", { subject: subject.name })}>
              <ArrowDown aria-hidden />
            </Button>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label={t("sameForAll", { subject: subject.name })}>
                  <Copy aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="flex w-64 flex-col gap-2">
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    apply();
                  }}
                >
                  <label htmlFor={`same-${subject.id}`} className="text-sm font-medium">
                    {t(view === "coefficients" ? "sameCoefficient" : "sameControls", { subject: subject.name })}
                  </label>
                  <p className="text-xs text-muted-foreground">{t(view === "coefficients" ? "sameHint" : "sameControlsHint")}</p>
                  <div className="flex gap-2">
                    <input
                      id={`same-${subject.id}`}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      inputMode={view === "controls" ? "numeric" : "decimal"}
                      autoComplete="off"
                      aria-invalid={(value.trim() !== "" && !valid) || undefined}
                      className="h-9 w-20 rounded-md border border-input bg-background px-2 text-center font-numeric text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
                    />
                    <Button type="submit" size="sm" disabled={!valid}>
                      {t("apply")}
                    </Button>
                  </div>
                </form>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
    </th>
  );
}
