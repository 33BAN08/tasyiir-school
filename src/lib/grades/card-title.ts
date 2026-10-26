import { ltr } from "@/lib/format";

type Translate = (key: "year" | "semester" | "trimester" | "period", values?: { number: number }) => string;

/** "Semestre 1" / "Trimestre 2" / "Année" — `t` is the `grades.periods` translator. */
export function cardPeriodName(card: { periodNumber: number | null; periodCount: number }, t: Translate): string {
  if (card.periodNumber === null) return t("year");
  const name = card.periodCount === 2 ? "semester" : card.periodCount === 3 ? "trimester" : "period";
  return t(name, { number: card.periodNumber });
}

/** "Semestre 1 · 2026-2027" (the year label kept left to right in Arabic). */
export function cardTitle(card: { periodNumber: number | null; periodCount: number; yearLabel: string }, t: Translate): string {
  return `${cardPeriodName(card, t)} · ${ltr(card.yearLabel)}`;
}
