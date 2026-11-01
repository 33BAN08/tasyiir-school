import "server-only";

import { getTranslations } from "next-intl/server";

import { csvAmount, csvPhone, toCsv, type CsvValue } from "@/lib/csv";
import { formatDate, formatMonth } from "@/lib/format";
import { studentName, studentOtherName } from "@/lib/students/names";

import type { Journal, JournalPayment, UnpaidRow } from "./reports";

// The CSV files of the unpaid list and the journal: headers and month names
// in the page's language; plain text (no isolate marks: Excel shows them as
// boxes), dates dd/MM/yyyy, amounts in dirhams with a decimal comma, phones
// "06 12 34 56 78". toCsv() neutralises formulas.

/** Columns for up to this many parents (name + phone each). */
const GUARDIAN_COLUMNS = 2;

export async function unpaidCsv(rows: UnpaidRow[], locale: string, withGuardians: boolean): Promise<string> {
  const [t, tu] = await Promise.all([
    getTranslations({ locale, namespace: "fees.csv" }),
    getTranslations({ locale, namespace: "fees.unpaid" }),
  ]);
  const guardianHeader = withGuardians
    ? Array.from({ length: GUARDIAN_COLUMNS }, (_, i) => [t("guardian", { n: i + 1 }), t("phone", { n: i + 1 })]).flat()
    : [];
  const header = [t("student"), t("otherName"), t("class"), t("months"), t("due"), t("oldest"), t("yearBalance"), ...guardianHeader];
  const body = rows.map((r): CsvValue[] => [
    studentName(r.names, "fr"),
    studentOtherName(r.names, "fr") ?? "",
    r.className ?? tu("noClass"),
    r.months.map((m) => (m.month ? formatMonth(m.month.slice(0, 7), locale) : tu("registration"))).join(", "),
    csvAmount(r.due),
    formatDate(r.oldestDueOn),
    csvAmount(r.yearBalance),
    ...(withGuardians
      ? Array.from({ length: GUARDIAN_COLUMNS }, (_, i) => {
          const g = r.guardians[i];
          return g ? [`${tu(`relations.${g.relation as "father" | "mother" | "tutor"}`)} : ${g.name}`, csvPhone(g.phone)] : ["", ""];
        }).flat()
      : []),
  ]);
  return toCsv(header, body);
}

export async function journalCsv(journal: Journal, locale: string): Promise<string> {
  const [t, tm, tr] = await Promise.all([
    getTranslations({ locale, namespace: "fees.csv" }),
    getTranslations({ locale, namespace: "fees.student.history.methods" }),
    getTranslations({ locale, namespace: "fees.student.cancel.paymentReasons" }),
  ]);
  const header = [
    t("line"), t("receipt"), t("date"), t("student"), t("class"), t("method"), t("amount"),
    t("bank"), t("reference"), t("chequeDate"), t("payer"), t("receivedBy"), t("state"),
  ];
  const row = (p: JournalPayment, line: string): CsvValue[] => [
    line,
    p.receiptLabel,
    formatDate(p.paidOn),
    p.names ? studentName(p.names, "fr") : "",
    p.className ?? "",
    tm(p.method),
    csvAmount(p.amount),
    p.bank ?? "",
    p.reference ?? "",
    p.chequeDate ? formatDate(p.chequeDate) : "",
    p.payerName ?? "",
    p.receivedBy ?? "",
    p.cancelled
      ? t("cancelledOn", { date: formatDate(p.cancelled.date), reason: tr(p.cancelled.reason as Parameters<typeof tr>[0]) })
      : t("valid"),
  ];
  return toCsv(header, [
    ...journal.payments.map((p) => row(p, t("lineReceipt"))),
    ...journal.cancellations.map((p) => row(p, t("lineCancellation"))),
  ]);
}
