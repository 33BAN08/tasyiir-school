// Rules of the fee reports (Phase 13 step 7): the journal's date range, the
// unpaid list's month filter, the journal totals. Plain module: used by the
// pages, the CSV route and the unit checks (scripts/rls/rules-csv.mjs).

import type { PaymentMethod } from "./payments";

export const MAX_JOURNAL_DAYS = 366;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const validDay = (s: string | undefined): s is string =>
  !!s && ISO_DAY.test(s) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

/** "yyyy-MM-dd" + n days. */
export function dayAdd(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The journal's dates from `?from=&to=`: both valid, from ≤ to, at most 366
 * days apart; otherwise (or when absent) this month: the 1st → today.
 */
export function journalRange(from: string | undefined, to: string | undefined, today: string): { from: string; to: string } {
  if (validDay(from) && validDay(to) && from <= to && days(from, to) <= MAX_JOURNAL_DAYS) return { from, to };
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export type UnpaidMonthFilter = { month: string | null; registration: boolean };

/**
 * `?month=` of the unpaid list: "registration", or "yyyy-MM" among the year's
 * billed months (→ its first day); anything else = every month.
 */
export function unpaidMonthFilter(param: string | undefined, billedMonths: readonly string[]): UnpaidMonthFilter {
  if (param === "registration") return { month: null, registration: true };
  const month = param && /^\d{4}-\d{2}$/.test(param) ? `${param}-01` : null;
  return month && billedMonths.includes(month) ? { month, registration: false } : { month: null, registration: false };
}

export type JournalTotals = Record<PaymentMethod, { amount: number; count: number }> & { total: { amount: number; count: number } };

/** Totals per method of the VALID receipts (cancelled ones stay listed but count for nothing). */
export function journalTotals(payments: readonly { amount: number; method: PaymentMethod; cancelled: unknown }[]): JournalTotals {
  const totals: JournalTotals = {
    cash: { amount: 0, count: 0 },
    cheque: { amount: 0, count: 0 },
    transfer: { amount: 0, count: 0 },
    total: { amount: 0, count: 0 },
  };
  for (const p of payments) {
    if (p.cancelled) continue;
    totals[p.method].amount += p.amount;
    totals[p.method].count += 1;
    totals.total.amount += p.amount;
    totals.total.count += 1;
  }
  return totals;
}
