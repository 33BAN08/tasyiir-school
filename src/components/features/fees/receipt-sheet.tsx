import { useTranslations } from "next-intl";

import { amountInWords } from "@/lib/fees/amount-words";
import { formatCentimes } from "@/lib/fees/money";
import type { Receipt, ReceiptLine } from "@/lib/fees/receipt";
import { formatDate, formatMonth, isolate, ltr } from "@/lib/format";
import { studentName, studentOtherName } from "@/lib/students/names";
import { cn } from "@/lib/utils";

/** A5 portrait, 8 mm margins: the sheet is 132 × 194 mm. */
export const RECEIPT_PRINT_CSS =
  "@page { size: A5 portrait; margin: 8mm; }" +
  "@media print { html, body { height: auto !important; min-height: 0 !important; background: none !important; }" +
  " body > :not(main) { display: none !important; } }";

type Props = {
  receipt: Receipt;
  schoolName: string;
  language: "fr" | "ar";
  /** 1 = the original; more = DUPLICATA. */
  printNo: number;
  /** A parent's copy from the portal: never stamped, so it says so instead of the stamp box. */
  parentCopy?: boolean;
};

/**
 * One A5 portrait receipt (8 mm margins → 132 × 194 mm): school + phone, the
 * receipt number, date, student, what it pays, method, amount in figures and
 * in words, stamp box. "DUPLICATA" from the second print on; a cancelled
 * receipt carries the "ANNULÉ / ملغى" band.
 */
export function ReceiptSheet({ receipt: r, schoolName, language, printNo, parentCopy = false }: Props) {
  const t = useTranslations("fees.receipt");
  const tLedger = useTranslations("fees.student.ledger");
  const tReason = useTranslations("fees.student.cancel.paymentReasons");
  const duplicate = printNo > 1;
  const lineLabel = (l: ReceiptLine) => {
    const service = l.serviceId ? r.serviceNames[l.serviceId] : null;
    const name = l.kind === "registration" ? tLedger("registration")
      : l.kind === "tuition" ? tLedger("tuition")
        : (service && (language === "ar" ? service.nameAr || service.name : service.name)) || tLedger("service");
    return l.month ? `${name} · ${formatMonth(l.month.slice(0, 7), language)}` : name;
  };
  const facts: [string, string][] = [
    [t("student"), isolate(studentName(r.student, language))],
    ...(studentOtherName(r.student, language) ? [[t("otherName"), isolate(studentOtherName(r.student, language) ?? "")] as [string, string]] : []),
    ...(r.student.massarCode ? [[t("massar"), ltr(r.student.massarCode)] as [string, string]] : []),
    [t("class"), `${r.className ? isolate(r.className) : "—"} · ${ltr(r.yearLabel)}`],
  ];
  const method = [
    t(`methods.${r.method}`),
    r.bank && isolate(r.bank),
    r.reference && (r.method === "cheque" ? t("chequeNo", { value: ltr(r.reference) }) : t("reference", { value: ltr(r.reference) })),
    r.chequeDate && t("chequeDate", { date: ltr(formatDate(r.chequeDate)) }),
  ].filter(Boolean).join(" · ");

  return (
    <section
      data-receipt-sheet={r.id}
      data-receipt-copy={duplicate ? "duplicate" : "original"}
      data-receipt-language={language}
      {...(r.cancelled ? { "data-receipt-cancelled": "" } : {})}
      className="relative flex h-[194mm] w-[132mm] shrink-0 flex-col gap-3 overflow-hidden bg-card p-[5mm] text-[10.5px] leading-snug text-card-foreground shadow-md [print-color-adjust:exact] print:h-[192mm] print:p-0 print:shadow-none"
      aria-label={t("sheetLabel", { label: r.label })}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-foreground pb-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{isolate(schoolName)}</p>
          {r.schoolPhone && <p className="text-muted-foreground">{t("phone", { phone: ltr(r.schoolPhone) })}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-end">
          <p className="text-[13px] font-semibold">{t("title")}</p>
          <div className="flex items-center gap-1.5">
            <span dir="ltr" className="whitespace-nowrap font-code text-[12px] font-semibold" data-receipt-no>{r.label}</span>
            <span
              className={cn(
                "whitespace-nowrap rounded-sm border px-1.5 py-px text-[9.5px] font-semibold leading-tight",
                duplicate ? "border-2 border-foreground tracking-widest" : "border-foreground/70 tracking-wide",
              )}
              data-receipt-copy-label
            >
              {duplicate ? t("duplicate") : t("original")}
            </span>
          </div>
          <p className="text-muted-foreground">{t("date", { date: ltr(formatDate(r.paidOn)) })}</p>
        </div>
      </header>

      <dl className="grid shrink-0 grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <table className="w-full shrink-0 border-collapse">
        <thead>
          <tr className="border-b border-foreground/50 text-muted-foreground">
            <th className="py-1 text-start font-medium">{t("covered")}</th>
            <th className="py-1 text-end font-medium">{t("amountColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {r.lines.map((l, i) => (
            <tr key={i} className="border-b border-foreground/15">
              <td className="py-1">
                {lineLabel(l)}
                {l.partial && <span className="text-muted-foreground"> ({t("partial")})</span>}
              </td>
              <td className="py-1 text-end font-numeric tabular-nums">{formatCentimes(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="grid shrink-0 grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">{t("method")}</dt>
        <dd>{method}</dd>
        {r.payerName && (
          <>
            <dt className="text-muted-foreground">{t("payer")}</dt>
            <dd>{isolate(r.payerName)}</dd>
          </>
        )}
        {r.receivedBy && (
          <>
            <dt className="text-muted-foreground">{t("receivedBy")}</dt>
            <dd>{isolate(r.receivedBy)}</dd>
          </>
        )}
        {r.note && (
          <>
            <dt className="text-muted-foreground">{t("note")}</dt>
            <dd>{isolate(r.note)}</dd>
          </>
        )}
      </dl>

      <div className="shrink-0 rounded border-2 border-foreground p-2">
        <p className="flex items-baseline justify-between gap-2">
          <span className="font-medium">{t("total")}</span>
          <span className="font-numeric text-[15px] font-semibold tabular-nums">{formatCentimes(r.amount)}</span>
        </p>
        <p className="mt-1" data-amount-words>
          {t("inWords")} <span className="font-medium">{amountInWords(r.amount, language)}</span>
        </p>
      </div>

      {r.cancelled && (
        <p className="shrink-0 font-medium text-danger">
          {t("cancelledInfo", { reason: tReason(r.cancelled.reason as Parameters<typeof tReason>[0]), date: ltr(`${formatDate(r.cancelled.at.date)} ${r.cancelled.at.time}`) })}
          {r.cancelled.note && <> · {isolate(r.cancelled.note)}</>}
        </p>
      )}

      {parentCopy ? (
        <p className="mt-auto shrink-0 text-center font-medium text-muted-foreground" data-receipt-parent-copy>
          {t("parentCopyNote")}
        </p>
      ) : (
        <div className="mt-auto flex shrink-0 justify-end" data-receipt-stamp>
          <div className="h-[24mm] w-[52mm] rounded border border-dashed border-foreground/50 p-1 text-center text-muted-foreground">
            {t("stamp")}
          </div>
        </div>
      )}

      {(r.cancelled || duplicate) && (
        <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "-rotate-[30deg] whitespace-nowrap rounded border-4 px-4 py-1 text-[40px] font-bold tracking-widest opacity-25",
              r.cancelled ? "border-danger text-danger" : "border-foreground text-foreground",
            )}
          >
            {r.cancelled ? t("cancelledBand") : t("duplicate")}
          </span>
        </div>
      )}
    </section>
  );
}
