import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { ltr } from "@/lib/format";
import { cn } from "@/lib/utils";

import { WRAP } from "./landing-ui";

const STUDENTS = [
  { key: "a", status: "present" },
  { key: "b", status: "absent" },
  { key: "c", status: "late" },
] as const;

const STATUS_STYLE = {
  present: "bg-lp-tint text-lp-brand",
  absent: "bg-lp-absent-bg text-lp-absent",
  late: "bg-lp-late-bg text-lp-late",
} as const;

/**
 * One day, three people: the teacher at 08:00, the parent at 08:10, the
 * director at 19:00. Illustrations with fictional names; the director's card
 * shows no figures (drawn bars only), so nothing reads as a real statistic.
 */
export function RoleCards() {
  const t = useTranslations("landing.home.roles");

  return (
    <section aria-label={t("label")} className={cn(WRAP, "relative z-10 -mt-10")}>
      <ul className="grid gap-5 md:grid-cols-3 md:gap-6">
        <Card role="teacher" time="08:00" who={t("teacher.who")} title={t("teacher.title")}>
          <ul className="flex flex-col gap-2">
            {STUDENTS.map(({ key, status }) => (
              <li key={key} className="flex items-center justify-between gap-2 rounded-xl bg-lp-bg px-3 py-2.5">
                <span>{t(`teacher.students.${key}`)}</span>
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-extrabold", STATUS_STYLE[status])}>
                  {t(`teacher.${status}`)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card role="parent" time="08:10" who={t("parent.who")} title={t("parent.title")}>
          <div className="flex flex-col gap-1.5 rounded-2xl bg-lp-bg p-3.5">
            <span className="font-extrabold">{t("parent.alert")}</span>
            <span className="text-sm text-lp-muted">{t("parent.lesson", { time: ltr("08:00") })}</span>
          </div>
          <span className="rounded-xl bg-lp-brand p-3 text-center text-sm font-extrabold text-lp-on-brand">{t("parent.send")}</span>
        </Card>

        <Card role="director" time="19:00" who={t("director.who")} title={t("director.title")}>
          <div className="grid grid-cols-2 gap-2.5">
            <Gauge label={t("director.sessions")} fill="w-[85%]" tone="bg-lp-brand" />
            <Gauge label={t("director.toReview")} fill="w-1/4" tone="bg-lp-late" />
          </div>
          <p className="text-sm leading-relaxed text-lp-muted">{t("director.alerts")}</p>
        </Card>
      </ul>
      <p className="mt-3 text-center text-xs text-lp-muted">{t("caption")}</p>
    </section>
  );
}

function Card({ role, time, who, title, children }: { role: string; time: string; who: string; title: string; children: ReactNode }) {
  return (
    <li data-role-card={role} className="flex flex-col gap-3 rounded-[1.6rem] bg-lp-surface p-5 shadow-xl">
      <span className="text-sm font-extrabold text-lp-brand">
        {who} · <span dir="ltr" className="font-numeric">{time}</span>
      </span>
      <h3 className="text-xl font-extrabold">{title}</h3>
      {children}
    </li>
  );
}

/** A label over a drawn bar: an illustration, not a figure. */
function Gauge({ label, fill, tone }: { label: string; fill: string; tone: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-lp-bg p-3">
      <span className="text-xs leading-snug text-lp-muted">{label}</span>
      <span aria-hidden className="h-2 overflow-hidden rounded-full bg-lp-line">
        <span className={cn("block h-full rounded-full", fill, tone)} />
      </span>
    </div>
  );
}
