import { ArrowDownToLine, Ban, Check, FileImage, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import { StatusChip } from "./status-chip";

// Small pictures next to each deep dive. Demo data only; the ones that only
// repeat the text are aria-hidden, the totals table is real content.

const CARD = "rounded-2xl border border-lp-line bg-lp-surface p-5 shadow-sm";

export function TimetableVisual() {
  const t = useTranslations("landing.hero.timetable");
  const cells = [
    { label: t("arabic"), tone: "bg-lp-tint text-lp-brand" },
    { label: t("maths"), tone: "border-2 border-dashed border-lp-brand bg-lp-surface text-lp-brand", icon: ArrowDownToLine },
    { label: t("french"), tone: "bg-lp-tint text-lp-brand" },
    { label: t("maths"), tone: "border-2 border-dashed border-lp-absent bg-lp-absent-bg text-lp-absent", icon: Ban },
  ];
  return (
    <div aria-hidden className={CARD}>
      <div className="grid grid-cols-2 gap-2">
        {cells.map((cell, i) => (
          <div key={i} className={cn("flex h-16 items-center justify-center gap-1.5 rounded-lg text-sm font-bold", cell.tone)}>
            {cell.icon && <cell.icon className="size-4" />}
            {cell.label}
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm font-bold text-lp-absent">{t("refused")}</p>
    </div>
  );
}

export function PhoneVisual() {
  const t = useTranslations("landing.hero.students");
  const ts = useTranslations("attendance.rollCall.status");
  const rows = [
    { name: t("youssef"), status: "present" as const },
    { name: t("salma"), status: "absent" as const },
    { name: t("adam"), status: "late" as const },
  ];
  return (
    <div aria-hidden className={cn(CARD, "mx-auto w-full max-w-xs rounded-[1.75rem]")}>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.name} className="flex min-h-11 items-center gap-3 rounded-xl bg-lp-bg px-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-lp-tint text-xs font-bold text-lp-brand">
              {row.name.slice(0, 1)}
            </span>
            <span className="flex-1 truncate text-sm font-semibold">{row.name}</span>
            <StatusChip status={row.status} label={ts(row.status)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function JustifyVisual() {
  const t = useTranslations("landing.hero");
  return (
    <div aria-hidden className={CARD}>
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-lp-info-bg text-lp-info">
          <FileImage className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="font-bold">{t("students.salma")}</p>
          <p className="text-sm text-lp-muted">
            <bdi>3AC-B</bdi> · <span dir="ltr">12/10 – 13/10</span>
          </p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <span className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-lp-brand text-sm font-bold text-lp-on-brand">
          <Check className="size-4" />
        </span>
        <span className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-lp-line text-sm font-bold text-lp-absent">
          <X className="size-4" />
        </span>
      </div>
    </div>
  );
}

const TOTALS = [
  { student: "salma", absences: 6, hours: 9, minutes: 0 },
  { student: "adam", absences: 4, hours: 5, minutes: 30 },
  { student: "imane", absences: 2, hours: 2, minutes: 0 },
] as const;

export function TotalsVisual() {
  const t = useTranslations("landing.dives.totals.sample");
  const ts = useTranslations("landing.hero.students");
  const tt = useTranslations("timetable");
  return (
    <div className={CARD}>
      <table className="w-full text-sm">
        <caption className="mb-3 text-start text-sm font-bold text-lp-muted">{t("caption")}</caption>
        <thead>
          <tr className="border-b border-lp-line text-lp-muted">
            <th scope="col" className="py-2 text-start font-semibold">
              {t("student")}
            </th>
            <th scope="col" className="py-2 text-end font-semibold">
              {t("absences")}
            </th>
            <th scope="col" className="py-2 text-end font-semibold">
              {t("hours")}
            </th>
          </tr>
        </thead>
        <tbody>
          {TOTALS.map((row) => (
            <tr key={row.student} className="border-b border-lp-line last:border-0">
              <th scope="row" className="py-2.5 text-start font-semibold">
                {ts(row.student)}
              </th>
              <td className="py-2.5 text-end tabular-nums">{row.absences}</td>
              <td className="py-2.5 text-end font-bold text-lp-brand tabular-nums">
                {tt("duration", { hasMinutes: row.minutes ? "yes" : "no", hours: row.hours, minutes: row.minutes })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
