import { getLocale, getTranslations } from "next-intl/server";

import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import type { ClassTotalsRow } from "@/lib/attendance/history";
import { PERIODS, type Period } from "@/lib/attendance/periods";
import { ltr } from "@/lib/format";
import { studentName } from "@/lib/students/names";
import { durationParts } from "@/lib/timetable/hours";
import { cn } from "@/lib/utils";

type Props = {
  rows: ClassTotalsRow[];
  classId: string;
  period: Period;
  from: string;
  to: string;
};

const dmy = (date: string) => {
  const [y, m, d] = date.split("-");
  return ltr(`${d}/${m}/${y}`);
};

/** Each student of a class with their absences (count, hours) and late arrivals over a period; most absent first. */
export async function ClassTotals({ rows, classId, period, from, to }: Props) {
  const [t, tTimetable, locale] = await Promise.all([getTranslations("absences.totals"), getTranslations("timetable"), getLocale()]);
  const duration = (minutes: number) => tTimetable("duration", durationParts(minutes));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label={t("periodLabel")} className="inline-flex rounded-lg bg-muted p-1">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`/absences?view=totals&class=${classId}&period=${p}`}
              aria-current={p === period ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                p === period && "bg-background text-foreground shadow-sm",
              )}
            >
              {t(`periods.${p}`)}
            </Link>
          ))}
        </nav>
        <span className="text-sm text-muted-foreground">{t("range", { from: dmy(from), to: dmy(to) })}</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t("noStudents")}</p>
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th scope="col" className="px-4 py-2 text-start font-medium">{t("student")}</th>
                  <th scope="col" className="px-4 py-2 text-start font-medium">{t("absences")}</th>
                  <th scope="col" className="px-4 py-2 text-start font-medium">{t("lates")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const { absences, absentMinutes, lates, lateMinutes } = row.totals;
                  const none = absences === 0 && lates === 0;
                  return (
                    <tr key={row.studentId} className={cn("border-b last:border-0", none && "text-muted-foreground")}>
                      <td className="px-4 py-2">
                        <Link href={`/students/${row.studentId}`} className="font-medium underline-offset-4 hover:underline">
                          <bdi>{studentName(row, locale)}</bdi>
                        </Link>
                      </td>
                      <td className={cn("px-4 py-2 tabular-nums", absences > 0 && "font-medium text-danger")}>
                        {absences > 0 ? t("absenceValue", { count: absences, duration: duration(absentMinutes) }) : "—"}
                      </td>
                      <td className={cn("px-4 py-2 tabular-nums", lates > 0 && "font-medium text-warning")}>
                        {lates > 0 ? t(lateMinutes > 0 ? "lateValueMinutes" : "lateValue", { count: lates, minutes: lateMinutes }) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
