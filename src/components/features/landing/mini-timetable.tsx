import { Ban, CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

type Cell = { subject: "arabic" | "french" | "maths" | "pc"; refused?: boolean };

/** Two hours of two days; Monday 10:00 is where "Maths · Prof. B" is being placed. */
const ROWS: { time: string; cells: [Cell, Cell] }[] = [
  { time: "08:00", cells: [{ subject: "arabic" }, { subject: "french" }] },
  { time: "10:00", cells: [{ subject: "maths", refused: true }, { subject: "pc" }] },
];

/** The hero's timetable card: a lesson refused because its teacher is already busy. */
export function MiniTimetable() {
  const t = useTranslations("landing.hero.timetable");

  return (
    <div className="rounded-2xl bg-lp-surface p-4 text-lp-ink shadow-xl">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-lp-muted">
        <CalendarDays className="size-4" aria-hidden />
        {t("title")}
      </p>
      <table className="w-full table-fixed border-separate border-spacing-1 text-xs">
        <caption className="sr-only">{t("title")}</caption>
        <thead>
          <tr>
            <td className="w-12" />
            <th scope="col" className="pb-1 font-bold text-lp-muted">
              {t("mon")}
            </th>
            <th scope="col" className="pb-1 font-bold text-lp-muted">
              {t("tue")}
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.time}>
              <th scope="row" dir="ltr" className="font-semibold text-lp-muted tabular-nums">
                {row.time}
              </th>
              {row.cells.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    "h-11 rounded-lg px-2 text-center font-bold",
                    cell.refused
                      ? "border-2 border-dashed border-lp-absent bg-lp-absent-bg text-lp-absent"
                      : "bg-lp-tint text-lp-brand",
                  )}
                >
                  {cell.refused ? (
                    <span className="inline-flex items-center gap-1">
                      <Ban className="size-3.5" aria-hidden />
                      {t("maths")}
                    </span>
                  ) : (
                    t(cell.subject)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 rounded-lg bg-lp-absent-bg px-3 py-2 text-lp-absent">
        <p className="text-xs font-semibold text-lp-muted">{t("dropping")}</p>
        <p className="text-sm font-bold">{t("refused")}</p>
        <p className="text-xs">{t("detail")}</p>
      </div>
    </div>
  );
}
