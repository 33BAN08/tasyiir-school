import { Phone } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { formatCentimes } from "@/lib/fees/money";
import { shortMonth } from "@/lib/fees/months";
import type { UnpaidRow } from "@/lib/fees/reports";
import { formatDate, isolate, ltr } from "@/lib/format";
import { formatMobile } from "@/lib/parents/phone";
import { studentName, studentOtherName } from "@/lib/students/names";

/**
 * The unpaid list: a table from md up, one card per student on phones. Each
 * row: student (→ student page), class, unpaid months, due to date, oldest
 * due date, parents with a call link.
 */
export async function UnpaidList({ rows, yearId, showGuardians }: { rows: UnpaidRow[]; yearId: string; showGuardians: boolean }) {
  const [t, locale] = await Promise.all([getTranslations("fees.unpaid"), getLocale()]);
  const monthChip = (m: { month: string | null; balance: number }) => (
    <span
      key={m.month ?? "registration"}
      className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-1.5 py-0.5 text-xs whitespace-nowrap text-danger"
      title={formatCentimes(m.balance)}
    >
      {m.month ? shortMonth(m.month, locale) : t("registration")}
    </span>
  );
  const guardians = (r: UnpaidRow) =>
    r.guardians.length === 0 ? (
      <span className="text-muted-foreground">{t("noGuardian")}</span>
    ) : (
      <ul className="flex flex-col gap-1">
        {r.guardians.map((g) => (
          <li key={`${g.relation}-${g.phone}`} className="flex flex-wrap items-center gap-x-2">
            <span className="text-muted-foreground">{t(`relations.${g.relation as "father" | "mother" | "tutor"}`)}</span>
            <span dir="auto">{g.name}</span>
            <a
              href={`tel:${g.phone}`}
              aria-label={t("call", { name: isolate(g.name) })}
              className="inline-flex min-h-11 items-center gap-1 font-numeric text-primary underline-offset-4 hover:underline"
              data-guardian-phone={g.phone}
            >
              <Phone className="size-3.5" aria-hidden />
              <span dir="ltr">{formatMobile(g.phone)}</span>
            </a>
          </li>
        ))}
      </ul>
    );
  const name = (r: UnpaidRow) => (
    <Link href={`/students/${r.studentId}?year=${yearId}`} className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline md:min-h-0">
      <span dir="auto">{studentName(r.names, locale)}</span>
    </Link>
  );
  const other = (r: UnpaidRow) => studentOtherName(r.names, locale);

  return (
    <>
      <div className="relative hidden overflow-x-auto rounded-xl border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-medium">{t("student")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("class")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("months")}</th>
              <th className="px-3 py-2 text-end font-medium">{t("due")}</th>
              <th className="px-3 py-2 text-start font-medium">{t("oldest")}</th>
              {showGuardians && <th className="px-3 py-2 text-start font-medium">{t("guardians")}</th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.studentId} data-unpaid-row={r.studentId} data-unpaid-due={r.due} className="align-top">
                <td className="px-3 py-2">
                  {name(r)}
                  {other(r) && <div className="text-xs text-muted-foreground" dir="auto">{other(r)}</div>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap" dir="auto">{r.className ?? t("noClass")}</td>
                <td className="px-3 py-2">
                  <div className="flex max-w-64 flex-wrap gap-1">{r.months.map(monthChip)}</div>
                </td>
                <td className="px-3 py-2 text-end whitespace-nowrap">
                  <div className="font-numeric font-semibold tabular-nums">{formatCentimes(r.due)}</div>
                  {r.yearBalance > r.due && (
                    <div className="text-xs text-muted-foreground">{t("yearBalance", { amount: formatCentimes(r.yearBalance) })}</div>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap font-numeric tabular-nums">{ltr(formatDate(r.oldestDueOn))}</td>
                {showGuardians && <td className="px-3 py-2">{guardians(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((r) => (
          <li key={r.studentId} data-unpaid-card={r.studentId} className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {name(r)}
                <div className="text-xs text-muted-foreground" dir="auto">{r.className ?? t("noClass")}</div>
              </div>
              <div className="shrink-0 text-end">
                <div className="font-numeric font-semibold tabular-nums">{formatCentimes(r.due)}</div>
                <div className="text-xs text-muted-foreground">{t("since", { date: ltr(formatDate(r.oldestDueOn)) })}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">{r.months.map(monthChip)}</div>
            {showGuardians && <div>{guardians(r)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}
