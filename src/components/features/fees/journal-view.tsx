import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { formatCentimes } from "@/lib/fees/money";
import type { Journal, JournalPayment } from "@/lib/fees/reports";
import { formatDate, isolate, ltr } from "@/lib/format";
import { studentName } from "@/lib/students/names";
import { cn } from "@/lib/utils";

const METHODS = ["cash", "cheque", "transfer"] as const;

/**
 * The payments journal: totals per method (valid receipts only), the
 * receipts of the period (cancelled ones struck through), its cheques, and
 * earlier receipts cancelled in the period.
 */
export async function JournalView({ journal }: { journal: Journal }) {
  const [t, tm, tr, locale] = await Promise.all([
    getTranslations("fees.journal"),
    getTranslations("fees.student.history.methods"),
    getTranslations("fees.student.cancel.paymentReasons"),
    getLocale(),
  ]);
  const reason = (r: string) => tr(r as Parameters<typeof tr>[0]);
  const student = (p: JournalPayment) =>
    p.names ? (
      <Link href={`/students/${p.studentId}`} className="underline-offset-4 hover:underline">
        <span dir="auto">{studentName(p.names, locale)}</span>
      </Link>
    ) : "—";
  const state = (p: JournalPayment) =>
    p.cancelled ? (
      <span className="text-danger">{t("cancelledOn", { date: ltr(formatDate(p.cancelled.date)), reason: reason(p.cancelled.reason) })}</span>
    ) : (
      <span className="text-muted-foreground">{t("valid")}</span>
    );
  const cheques = journal.payments.filter((p) => p.method === "cheque");
  const cancelledTotal = journal.cancellations.reduce((n, p) => n + p.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="journal-totals" className="flex flex-col gap-2">
        <h2 id="journal-totals" className="font-semibold">{t("totalsTitle")}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[...METHODS, "total" as const].map((key) => (
            <div
              key={key}
              className={cn("flex flex-col gap-1 rounded-xl border bg-card p-4", key === "total" && "border-primary/40 bg-primary/5")}
              data-journal-total={key}
              data-amount={journal.totals[key].amount}
              data-count={journal.totals[key].count}
            >
              <span className="text-sm text-muted-foreground">{key === "total" ? t("total") : tm(key)}</span>
              <span className="font-numeric text-xl font-bold tabular-nums">{formatCentimes(journal.totals[key].amount)}</span>
              <span className="text-xs text-muted-foreground">{t("receipts", { count: journal.totals[key].count })}</span>
            </div>
          ))}
        </div>
      </section>

      <Block id="journal-receipts" title={t("receiptsTitle")} empty={journal.payments.length === 0 ? t("receiptsEmpty") : null}>
        <Table
          head={[t("receipt"), t("date"), t("student"), t("class"), t("method"), t("amount"), t("receivedBy"), t("state")]}
          numeric={5}
          rows={journal.payments.map((p) => ({
            key: p.id,
            attrs: { "data-journal-payment": p.id, "data-journal-state": p.cancelled ? "cancelled" : "valid" },
            muted: !!p.cancelled,
            cells: [
              <span key="r" dir="ltr" className="font-code whitespace-nowrap">{p.receiptLabel}</span>,
              ltr(formatDate(p.paidOn)),
              student(p),
              p.className ? <span dir="auto">{p.className}</span> : "—",
              [tm(p.method), p.bank && isolate(p.bank)].filter(Boolean).join(" · "),
              formatCentimes(p.amount),
              p.receivedBy ? <span dir="auto">{p.receivedBy}</span> : "—",
              state(p),
            ],
          }))}
        />
      </Block>

      <Block id="journal-cheques" title={t("chequesTitle")} empty={cheques.length === 0 ? t("chequesEmpty") : null}>
        <Table
          head={[t("bank"), t("chequeNo"), t("chequeDate"), t("amount"), t("student"), t("payer"), t("receipt"), t("state")]}
          numeric={3}
          rows={cheques.map((p) => ({
            key: p.id,
            attrs: { "data-journal-cheque": p.id },
            muted: !!p.cancelled,
            cells: [
              p.bank ? <span dir="auto">{p.bank}</span> : "—",
              p.reference ? <span dir="ltr" className="font-code">{p.reference}</span> : "—",
              p.chequeDate ? ltr(formatDate(p.chequeDate)) : "—",
              formatCentimes(p.amount),
              student(p),
              p.payerName ? <span dir="auto">{p.payerName}</span> : "—",
              <span key="r" dir="ltr" className="font-code whitespace-nowrap">{p.receiptLabel}</span>,
              state(p),
            ],
          }))}
        />
      </Block>

      {journal.cancellations.length > 0 && (
        <Block id="journal-cancellations" title={t("cancellationsTitle")} empty={null}>
          <p className="text-sm text-muted-foreground">
            {t("cancellationsHint")} {t("cancellationsTotal", { amount: formatCentimes(cancelledTotal) })}
          </p>
          <Table
            head={[t("receipt"), t("date"), t("student"), t("method"), t("amount"), t("state")]}
            numeric={4}
            rows={journal.cancellations.map((p) => ({
              key: p.id,
              attrs: { "data-journal-cancellation": p.id, "data-amount": p.amount },
              muted: false,
              cells: [
                <span key="r" dir="ltr" className="font-code whitespace-nowrap">{p.receiptLabel}</span>,
                ltr(formatDate(p.paidOn)),
                student(p),
                tm(p.method),
                formatCentimes(p.amount),
                state(p),
              ],
            }))}
          />
        </Block>
      )}
    </div>
  );
}

function Block({ id, title, empty, children }: { id: string; title: string; empty: string | null; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-2">
      <h2 id={id} className="font-semibold">{title}</h2>
      {empty ? <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">{empty}</p> : children}
    </section>
  );
}

type Row = { key: string; attrs: Record<string, string | number>; muted: boolean; cells: React.ReactNode[] };

/** A table scrolling inside its card (phones), the amount column (`numeric`) aligned at the end. */
function Table({ head, rows, numeric }: { head: string[]; rows: Row[]; numeric: number }) {
  return (
    <div className="relative overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={cn("px-3 py-2 font-medium whitespace-nowrap", i === numeric ? "text-end" : "text-start")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.key} {...r.attrs} className={cn("align-top", r.muted && "text-muted-foreground")}>
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-3 py-2",
                    i === numeric ? "text-end font-numeric tabular-nums whitespace-nowrap" : "",
                    i === numeric && r.muted && "line-through",
                  )}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
