import { useTranslations } from "next-intl";

import { formatDate, isolate, ltr } from "@/lib/format";
import { cardPeriodName } from "@/lib/grades/card-title";
import { formatAverage, formatMark } from "@/lib/grades/marks";
import { mentionFor } from "@/lib/grades/mention";
import type { CardMark, ReportCard } from "@/lib/grades/publications";

/** At most this many term remarks are printed (the newest, two lines each at most), so a card stays on one page. */
const MAX_REMARKS = 6;

type Props = {
  card: ReportCard;
  school: { name: string; logoUrl: string | null };
  student: { name: string; otherName: string | null; massarCode: string | null };
  className: string;
};

const avg = (v: number | null) => (v === null ? "—" : formatAverage(v));

/**
 * One A4 portrait page (10 mm margins → 190 × 277 mm): school, student, the
 * subjects table, general average + mention, the term's remarks, the class
 * council's remark, signatures. Built only from the published card. Every
 * block keeps its size; only the remarks block takes the space left (and
 * clips), so a card never spills onto a second page. The next sheet starts a
 * new page; 2 mm under the printable height (Chrome otherwise rounds onto a
 * blank page).
 */
export function ReportCardSheet({ card, school, student, className }: Props) {
  const t = useTranslations("reportCards.print");
  const tp = useTranslations("grades.periods");
  const tTypes = useTranslations("remarks.types");
  const year = card.periodNumber === null;
  const periodName = cardPeriodName(card, tp);
  const periodOf = (n: number) => cardPeriodName({ periodNumber: n, periodCount: card.periodCount }, tp);
  const showRank = card.rank !== null || card.subjects.some((s) => s.rank !== null);
  const semesters = year ? [...new Set(card.subjects.flatMap((s) => s.periods.map((p) => p.number)))].sort() : [];
  const mention = mentionFor(card.average, card.scale);
  const remarks = [...card.remarks].reverse().slice(0, MAX_REMARKS);
  const more = card.remarks.length - remarks.length;
  const markText = (m: CardMark) =>
    `${m.kind === "activities" ? `${t("activitiesShort")} ` : ""}${m.absent ? t("absentShort") : m.score === null ? "—" : formatMark(m.score)}`;
  const cell = "border border-foreground/50 px-1.5 py-0.5";

  return (
    <section
      data-report-card-sheet={card.studentId}
      className="flex h-[277mm] w-[190mm] shrink-0 flex-col gap-2.5 overflow-hidden bg-card p-[6mm] text-[10.5px] leading-snug text-card-foreground shadow-md [print-color-adjust:exact] print:h-[275mm] print:p-0 print:shadow-none print:[&+&]:break-before-page"
      aria-label={t("sheetLabel", { name: student.name })}
    >
      <header className="flex shrink-0 items-start justify-between gap-4 border-b-2 border-foreground pb-2">
        <div className="flex min-w-0 items-center gap-2">
          {school.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logos come from Supabase Storage
            <img src={school.logoUrl} alt="" className="size-12 shrink-0 object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- static SVG
            <img src="/brand/tasyir-icon.svg" alt="" className="size-12 shrink-0" />
          )}
          <span className="text-base font-semibold" dir="auto">{school.name}</span>
        </div>
        <div className="flex flex-col items-end text-end">
          <h2 className="text-lg font-bold">{t("title")}</h2>
          <span className="font-semibold">{periodName}</span>
          <span>{t("year", { year: ltr(card.yearLabel) })}</span>
        </div>
      </header>

      <dl className="grid shrink-0 grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-1 rounded border border-foreground/50 p-2">
        <dt className="font-semibold">{t("student")}</dt>
        <dd dir="auto">
          {student.name}
          {student.otherName && <span className="ms-2" dir="auto">{student.otherName}</span>}
        </dd>
        <dt className="font-semibold">{t("class")}</dt>
        <dd dir="auto">{className}</dd>
        <dt className="font-semibold">{t("massar")}</dt>
        <dd className="font-numeric">{student.massarCode ? ltr(student.massarCode) : "—"}</dd>
        <dt className="font-semibold">{t("scale")}</dt>
        <dd>{ltr(`/${card.scale}`)}</dd>
      </dl>

      <table className="w-full shrink-0 border-collapse text-center" data-report-card-table>
        <thead className="bg-muted">
          <tr>
            <th className={`${cell} text-start`}>{t("subject")}</th>
            <th className={cell}>{t("coefficient")}</th>
            {year
              ? semesters.map((n) => <th key={n} className={cell}>{periodOf(n)}</th>)
              : <th className={cell}>{t("marks")}</th>}
            <th className={cell}>{t("average")}</th>
            <th className={cell}>{t("classAverage")}</th>
            <th className={cell}>{t("min")}</th>
            <th className={cell}>{t("max")}</th>
            {showRank && <th className={cell}>{t("rank")}</th>}
          </tr>
        </thead>
        <tbody className="font-numeric tabular-nums">
          {card.subjects.map((s) => (
            <tr key={s.subjectId} data-sheet-subject={s.subjectId}>
              <td className={`${cell} text-start font-sans`} dir="auto">{s.name}</td>
              <td className={cell}>{s.coefficient === null ? "—" : formatMark(s.coefficient)}</td>
              {year
                ? semesters.map((n) => <td key={n} className={cell}>{avg(s.periods.find((p) => p.number === n)?.average ?? null)}</td>)
                : <td className={`${cell} text-[10px]`}>{s.marks.length ? s.marks.map(markText).join(" · ") : "—"}</td>}
              <td className={`${cell} font-bold`}>{avg(s.average)}</td>
              <td className={cell}>{avg(s.classAverage)}</td>
              <td className={cell}>{avg(s.classMin)}</td>
              <td className={cell}>{avg(s.classMax)}</td>
              {showRank && <td className={cell}>{s.rank ?? "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid shrink-0 grid-cols-2 gap-3">
        <div className="flex flex-col gap-1 rounded border-2 border-foreground p-2" data-sheet-general>
          <span className="font-semibold">{t("general")}</span>
          <span className="font-numeric text-2xl font-bold tabular-nums">
            {avg(card.average)} <span className="text-sm font-normal">{ltr(`/${card.scale}`)}</span>
          </span>
          <span data-sheet-mention={mention ?? ""}>{t("mentionLine", { mention: mention ? t(`mentions.${mention}`) : "—" })}</span>
          {card.rank !== null && card.ranked !== null && (
            <span data-sheet-rank={card.rank}>{t("rankOf", { rank: card.rank, ranked: card.ranked })}</span>
          )}
        </div>
        <div className="flex flex-col gap-1 rounded border border-foreground/50 p-2 font-numeric tabular-nums">
          <span className="font-sans font-semibold">{t("classFigures")}</span>
          <span>{t("classAverageLine", { value: avg(card.classAverage) })}</span>
          <span>{t("minMaxLine", { min: avg(card.classMin), max: avg(card.classMax) })}</span>
          {year && card.periods.map((p) => (
            <span key={p.number}>{t("periodLine", { period: periodOf(p.number), value: avg(p.average) })}</span>
          ))}
          {card.missing > 0 && <span className="font-sans text-[10px]">{t(year ? "missingYear" : "missing", { count: card.missing })}</span>}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden">
        <h3 className="font-semibold">{t(year ? "remarksYear" : "remarks")}</h3>
        {remarks.length === 0 ? (
          <p className="text-muted-foreground">{t("noRemarks")}</p>
        ) : (
          <ul className="flex flex-col gap-0.5" data-sheet-remarks={card.remarks.length}>
            {remarks.map((r, i) => (
              <li key={i} className="line-clamp-2">
                {t("remarkLine", { date: ltr(formatDate(r.date)), type: tTypes(r.type), body: isolate(r.body) })}
              </li>
            ))}
            {more > 0 && <li className="text-muted-foreground">{t("moreRemarks", { count: more })}</li>}
          </ul>
        )}
      </div>

      <div className="flex min-h-[18mm] shrink-0 flex-col gap-1 rounded border border-foreground/50 p-2" data-sheet-council>
        <h3 className="font-semibold">{t("council")}</h3>
        <p className="whitespace-pre-line" dir="auto">{card.councilRemark ?? ""}</p>
      </div>

      <footer className="grid shrink-0 grid-cols-2 gap-6">
        <div className="flex h-[18mm] flex-col rounded border border-foreground/50 p-2">{t("signDirector")}</div>
        <div className="flex h-[18mm] flex-col rounded border border-foreground/50 p-2">{t("signParents")}</div>
      </footer>
      <p className="shrink-0 text-center text-[9px] text-muted-foreground">
        {t("publishedOn", { date: ltr(formatDate(card.publishedAt.slice(0, 10))) })}
      </p>
    </section>
  );
}
