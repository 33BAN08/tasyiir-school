import { CircleAlert, Printer } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { averageKey, indexAverages, type AverageRow } from "@/lib/grades/averages";
import { formatAverage, formatMark, partlyEntered } from "@/lib/grades/marks";
import { SUBJECT_SWATCH, type SubjectColor } from "@/lib/structure/subject-template";
import { cn } from "@/lib/utils";

import type { SheetRowStudent } from "./sheet-types";

type Props = {
  /** null = the year. */
  periodId: string | null;
  year: boolean;
  /** Report card order. */
  subjects: { id: string; name: string; color: SubjectColor; coefficient: number | null }[];
  /** The class's students, names in the page language. */
  students: SheetRowStudent[];
  /** class_averages() rows of this semester (or of the year). */
  rows: AverageRow[];
  /** Published + grades.manage: one student's report card to print. */
  printHref: ((studentId: string) => string) | null;
  /** Marks entered / expected for a student + subject (semester view; null on the year). */
  count: (studentId: string, subjectId: string) => { entered: number; expected: number } | null;
};

const shown = (v: number | null) => (v === null ? "—" : formatAverage(v));

/**
 * One class, one semester (or the year): students by rank, each subject's
 * average, the general average; then the class average, lowest and highest.
 * Every number comes from class_averages(), nothing is computed here.
 */
export function AveragesTable({ periodId, year, subjects, students, rows, printHref, count }: Props) {
  const t = useTranslations("grades.averages");
  const index = indexAverages(rows);
  const get = (studentId: string, subjectId: string | null) => index.get(averageKey(studentId, periodId, subjectId));
  const general = (studentId: string) => get(studentId, null);
  const ranks = new Map<number, number>();
  for (const s of students) {
    const r = general(s.id)?.rank;
    if (r) ranks.set(r, (ranks.get(r) ?? 0) + 1);
  }
  const ordered = [...students].sort((a, b) => (general(a.id)?.rank ?? Infinity) - (general(b.id)?.rank ?? Infinity));
  const columns: (string | null)[] = [...subjects.map((s) => s.id), null];
  // Class figures: the same on every row of a column, read from the first student's.
  const figure = (subjectId: string | null, k: "classAverage" | "classMin" | "classMax") =>
    students.length ? (get(students[0].id, subjectId)?.[k] ?? null) : null;
  const ranked = students.length ? (general(students[0].id)?.ranked ?? 0) : 0;
  const missingCount = students.filter((s) => (general(s.id)?.missing ?? 0) > 0).length;

  if (students.length === 0) return <p className="text-muted-foreground">{t("noStudents")}</p>;

  return (
    <div className="flex flex-col gap-2">
      <Card className="gap-0 overflow-hidden py-0" data-averages-table>
        {/* relative: the sr-only texts (absolute) stay inside the scroll box, else they widen the page on phones. */}
        <div className="relative overflow-x-auto">
          <table className="w-max min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b align-bottom">
                <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{t("rank")}</th>
                <th scope="col" className="sticky start-0 z-10 bg-card px-3 py-2 text-start text-xs font-medium text-muted-foreground">
                  {t("student")}
                </th>
                {subjects.map((s) => (
                  <th key={s.id} scope="col" className="max-w-28 px-2 py-2 text-center text-xs font-semibold">
                    <span className="flex items-center justify-center gap-1.5">
                      <span className={cn("size-2 shrink-0 rounded-full", SUBJECT_SWATCH[s.color])} aria-hidden />
                      <span className="line-clamp-2">{s.name}</span>
                    </span>
                    {s.coefficient !== null && (
                      <span className="block font-normal text-muted-foreground">{t("coefficient", { value: formatMark(s.coefficient) })}</span>
                    )}
                  </th>
                ))}
                <th scope="col" className="bg-muted/50 px-3 py-2 text-center text-xs font-semibold">{t("general")}</th>
                {printHref && <th scope="col" className="px-2 py-2 text-center text-xs font-medium text-muted-foreground">{t("print")}</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {ordered.map((s) => {
                const g = general(s.id);
                const tie = g?.rank ? (ranks.get(g.rank) ?? 0) > 1 : false;
                return (
                  <tr key={s.id} data-student={s.id} data-rank={g?.rank ?? ""}>
                    <td className="px-3 py-1.5 text-center font-numeric tabular-nums">
                      {g?.rank ? (
                        <>
                          <span className="font-semibold">{g.rank}</span>
                          {tie && <span className="block text-xs text-muted-foreground">{t("tie")}</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <th scope="row" className="sticky start-0 z-10 bg-card px-3 py-1.5 text-start font-normal shadow-[inset_-1px_0_0_var(--color-border)] rtl:shadow-[inset_1px_0_0_var(--color-border)]">
                      <span className="block max-w-56 truncate font-medium" dir="auto">{s.name}</span>
                      {s.otherName && <span className="block max-w-56 truncate text-xs text-muted-foreground" dir="auto">{s.otherName}</span>}
                    </th>
                    {subjects.map((subject) => {
                      const v = get(s.id, subject.id)?.average ?? null;
                      const c = count(s.id, subject.id);
                      return (
                        <td key={subject.id} data-average={subject.id} className="px-2 py-1.5 text-center font-numeric tabular-nums">
                          <span data-average-value className={cn(v === null && "text-muted-foreground")}>{shown(v)}</span>
                          {c && partlyEntered(c.entered, c.expected) && (
                            <>
                              <span data-average-count={`${c.entered}/${c.expected}`} className="ms-1 text-xs text-muted-foreground">
                                {t("count", { entered: c.entered, expected: c.expected })}
                              </span>
                              <span data-incomplete className="block text-[10px] text-muted-foreground">{t("incomplete")}</span>
                            </>
                          )}
                        </td>
                      );
                    })}
                    <td data-average="general" className="bg-muted/50 px-3 py-1.5 text-center font-numeric font-semibold tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        {shown(g?.average ?? null)}
                        {(g?.missing ?? 0) > 0 && (
                          <span data-missing={g?.missing} className="inline-flex text-warning" title={t(year ? "missingSemesters" : "missingSubjects", { count: g?.missing ?? 0 })}>
                            <CircleAlert className="size-3.5" aria-hidden />
                            <span className="sr-only">{t(year ? "missingSemesters" : "missingSubjects", { count: g?.missing ?? 0 })}</span>
                          </span>
                        )}
                      </span>
                    </td>
                    {printHref && (
                      <td className="px-2 py-1.5 text-center">
                        <Link
                          href={printHref(s.id)}
                          target="_blank"
                          data-print-student={s.id}
                          aria-label={t("printFor", { name: s.name })}
                          className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Printer className="size-4" aria-hidden />
                        </Link>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 text-muted-foreground">
              {(["classAverage", "classMin", "classMax"] as const).map((k) => (
                <tr key={k} data-class-figure={k}>
                  <td />
                  <th scope="row" className="sticky start-0 z-10 bg-card px-3 py-1.5 text-start text-xs font-medium">{t(k)}</th>
                  {columns.map((c) => (
                    <td key={c ?? "general"} className={cn("px-2 py-1.5 text-center font-numeric text-xs tabular-nums", c === null && "bg-muted/50")}>
                      {shown(figure(c, k))}
                    </td>
                  ))}
                  {printHref && <td />}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      </Card>
      <p className="text-sm text-muted-foreground" data-averages-summary>
        {t("summary", { ranked, total: students.length })}
        {missingCount > 0 && ` · ${t(year ? "summaryMissingYear" : "summaryMissing", { count: missingCount })}`}
      </p>
      <p className="text-xs text-muted-foreground">{t(year ? "howYear" : "howSemester")}</p>
    </div>
  );
}
