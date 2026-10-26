"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

/** One student with empty cells: each subject (and semester, for the year) with marks entered / expected. */
export type GapStudent = {
  student: string;
  /** The class, when the list covers several classes (locking a semester). */
  group?: string;
  items: { subject: string; period: string | null; entered: number; expected: number }[];
};

/**
 * Before locking or publishing: who still has empty cells. Empty = not graded
 * yet, left out of the average; continuing is allowed. `more` = students not
 * listed (the list is capped).
 */
export function GapsList({ gaps, more = 0 }: { gaps: GapStudent[]; more?: number }) {
  const t = useTranslations("grades.gaps");
  if (gaps.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm" data-gaps={gaps.length + more}>
      <p className="flex items-center gap-2 font-medium">
        <CircleAlert className="size-4 shrink-0 text-warning" aria-hidden />
        {t("title", { count: gaps.length + more })}
      </p>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pe-1">
        {gaps.map((g, i) => (
          <li key={i} data-gap-student className="flex flex-col">
            <span className="font-medium" dir="auto">
              {g.student}
              {g.group && <span className="ms-2 text-xs font-normal text-muted-foreground" dir="auto">{g.group}</span>}
            </span>
            <span className="text-xs text-muted-foreground">
              {g.items
                .map((it) => t(it.period ? "itemPeriod" : "item", { subject: it.subject, period: it.period ?? "", entered: it.entered, expected: it.expected }))
                .join(" · ")}
            </span>
          </li>
        ))}
        {more > 0 && <li className="text-xs text-muted-foreground">{t("more", { count: more })}</li>}
      </ul>
    </div>
  );
}
