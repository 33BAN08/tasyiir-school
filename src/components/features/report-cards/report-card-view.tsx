import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import { PostedAt } from "@/components/features/announcements/posted-at";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, ltr } from "@/lib/format";
import { cardPeriodName, cardTitle } from "@/lib/grades/card-title";
import { formatAverage, formatMark } from "@/lib/grades/marks";
import type { CardMark, CardSubject, ReportCard } from "@/lib/grades/publications";
import { SUBJECT_SWATCH, type SubjectColor } from "@/lib/structure/subject-template";
import { cn } from "@/lib/utils";

const avg = (v: number | null) => (v === null ? "—" : formatAverage(v));

/**
 * One published report card, as the parent reads it (phones first): the
 * general average, rank and class figures, then each subject (marks of the
 * semester, or each semester's average on the year card). Nothing is computed
 * here: everything was frozen when the school published it.
 */
export function ReportCardView({ card }: { card: ReportCard }) {
  const t = useTranslations("reportCards");
  const tp = useTranslations("grades.periods");
  const tTypes = useTranslations("remarks.types");
  const periodOf = (number: number) => cardPeriodName({ periodNumber: number, periodCount: card.periodCount }, tp);

  return (
    <div className="flex flex-col gap-4" data-report-card={card.id}>
      <Card className="gap-3">
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-semibold">{cardTitle(card, tp)}</h2>
            <p className="text-xs text-muted-foreground">
              {t("publishedOn")} <PostedAt value={card.publishedAt} />
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div className="flex flex-col">
              <span className="text-sm text-muted-foreground">{t("general")}</span>
              <span className="font-numeric text-3xl font-bold tabular-nums" data-card-average>
                {avg(card.average)}
                <span className="ms-1 text-base font-normal text-muted-foreground">{ltr(`/${card.scale}`)}</span>
              </span>
            </div>
            {card.rank !== null && card.ranked !== null && (
              <div className="flex flex-col" data-card-rank={card.rank}>
                <span className="text-sm text-muted-foreground">{t("rankLabel")}</span>
                <span className="text-xl font-semibold">{t("rank", { rank: card.rank, ranked: card.ranked })}</span>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {t("classFigures", { average: avg(card.classAverage), min: avg(card.classMin), max: avg(card.classMax) })}
          </p>
          {card.missing > 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CircleAlert className="size-4 shrink-0 text-warning" aria-hidden />
              {t(card.periodNumber === null ? "missingYear" : "missing", { count: card.missing })}
            </p>
          )}
          {card.periods.length > 0 && (
            <ul className="flex flex-col divide-y rounded-lg border" data-card-periods>
              {card.periods.map((p) => (
                <li key={p.number} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span>{periodOf(p.number)}</span>
                  <span className="font-numeric font-semibold tabular-nums">
                    {avg(p.average)}
                    {p.rank !== null && <span className="ms-2 font-normal text-muted-foreground">{t("rankShort", { rank: p.rank })}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <h2 className="text-base font-semibold">{t("subjects")}</h2>
      <ul className="flex flex-col gap-3">
        {card.subjects.map((s) => (
          <SubjectRow key={s.subjectId} subject={s} periodOf={periodOf} />
        ))}
      </ul>

      {card.councilRemark && (
        <Card className="gap-2" data-card-council>
          <CardContent className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">{t("council")}</h2>
            <p className="whitespace-pre-line text-sm" dir="auto">{card.councilRemark}</p>
          </CardContent>
        </Card>
      )}
      {card.remarks.length > 0 && (
        <Card className="gap-2" data-card-remarks={card.remarks.length}>
          <CardContent className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">{t(card.periodNumber === null ? "remarksYear" : "remarks")}</h2>
            <ul className="flex flex-col gap-2">
              {[...card.remarks].reverse().map((r, i) => (
                <li key={i} className="flex flex-col text-sm">
                  <span className="text-xs text-muted-foreground">{ltr(formatDate(r.date))} · {tTypes(r.type)}</span>
                  <span dir="auto">{r.body}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SubjectRow({ subject: s, periodOf }: { subject: CardSubject; periodOf: (n: number) => string }) {
  const t = useTranslations("reportCards");
  const swatch = SUBJECT_SWATCH[s.color as SubjectColor] ?? SUBJECT_SWATCH.slate;
  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-3" data-card-subject={s.subjectId}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2 font-medium">
            <span className={cn("size-2.5 shrink-0 rounded-full", swatch)} aria-hidden />
            <span className="truncate" dir="auto">{s.name}</span>
          </span>
          {s.coefficient !== null && (
            <span className="text-xs text-muted-foreground">{t("coefficient", { value: formatMark(s.coefficient) })}</span>
          )}
        </div>
        <span className="font-numeric text-xl font-semibold tabular-nums" data-subject-average>{avg(s.average)}</span>
      </div>
      {s.marks.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("marks")}>
          {s.marks.map((m) => (
            <li key={`${m.kind}-${m.number}`} className="rounded-md bg-muted px-2 py-1 text-xs">
              <MarkChip mark={m} />
            </li>
          ))}
        </ul>
      )}
      {s.periods.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {s.periods.map((p) => t("periodAverage", { period: periodOf(p.number), average: avg(p.average) })).join(" · ")}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {t("subjectClass", { average: avg(s.classAverage), min: avg(s.classMin), max: avg(s.classMax) })}
        {s.rank !== null && ` · ${t("rankShort", { rank: s.rank })}`}
      </p>
    </li>
  );
}

function MarkChip({ mark }: { mark: CardMark }) {
  const t = useTranslations("reportCards");
  const label = mark.kind === "activities" ? t("activities") : t("control", { number: mark.number });
  return (
    <>
      <span className="text-muted-foreground">{label} </span>
      <span className="font-numeric font-medium tabular-nums">
        {mark.absent ? t("absent") : mark.score === null ? "—" : formatMark(mark.score)}
      </span>
    </>
  );
}
