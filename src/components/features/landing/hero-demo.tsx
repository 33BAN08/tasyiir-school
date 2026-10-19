"use client";

import { BellRing, CalendarX2, CircleCheck, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { MiniTimetable } from "./mini-timetable";
import { StatusChip, type DemoStatus } from "./status-chip";

const STUDENTS = ["salma", "youssef", "imane", "adam", "hiba"] as const;
type StudentKey = (typeof STUDENTS)[number];

const NEXT: Record<DemoStatus, DemoStatus> = { present: "absent", absent: "late", late: "present" };

const INITIAL: Record<StudentKey, DemoStatus> = {
  salma: "absent",
  youssef: "present",
  imane: "present",
  adam: "late",
  hiba: "present",
};

/**
 * The hero's interactive example (demo data only, no autoplay). The server
 * renders the first state, so without JavaScript it is a static picture.
 * Tapping a student cycles present → absent → late, like the real roll call.
 */
export function HeroDemo() {
  const t = useTranslations("landing.hero");
  const tr = useTranslations("attendance.rollCall");
  const [marks, setMarks] = useState(INITIAL);
  const [saved, setSaved] = useState(false);

  const count = (status: DemoStatus) => STUDENTS.filter((s) => marks[s] === status).length;

  function cycle(student: StudentKey) {
    setSaved(false);
    setMarks((prev) => ({ ...prev, [student]: NEXT[prev[student]] }));
  }

  return (
    <div role="group" aria-label={t("demoLabel")} className="flex w-full flex-col gap-3">
      <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-lp-band-2 px-3 py-1 text-xs font-semibold text-lp-band-muted">
        <Info className="size-3.5" aria-hidden />
        {t("demoNote")}
      </p>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] sm:items-start">
        {/* Teacher's phone */}
        <div className="rounded-[1.75rem] border-[6px] border-lp-band-2 bg-lp-surface text-lp-ink shadow-xl">
          <div className="border-b border-lp-line px-4 pt-4 pb-3">
            <p className="text-base font-extrabold">{t("rollCall.title")}</p>
            <p className="text-sm text-lp-muted">
              {t("rollCall.class")} · <span dir="ltr">08:00–09:00</span>
            </p>
          </div>
          <p className="px-4 pt-3 text-xs text-lp-muted">{t("rollCall.hint")}</p>
          <ul aria-label={t("rollCall.listLabel")} className="flex flex-col gap-1 p-2">
            {STUDENTS.map((student) => {
              const name = t(`students.${student}`);
              const status = tr(`status.${marks[student]}`);
              return (
                <li key={student}>
                  <button
                    type="button"
                    onClick={() => cycle(student)}
                    aria-label={tr("rowLabel", { name, status })}
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-start outline-none hover:bg-lp-bg focus-visible:outline-2 focus-visible:outline-lp-brand"
                  >
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-lp-tint text-xs font-bold text-lp-brand"
                    >
                      {name.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
                    <StatusChip status={marks[student]} label={status} />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2 border-t border-lp-line px-4 py-3">
            <p className="text-xs font-semibold text-lp-muted" aria-live="polite">
              {saved
                ? t("rollCall.saved")
                : t("rollCall.counts", { present: count("present"), absent: count("absent"), late: count("late") })}
            </p>
            <button
              type="button"
              onClick={() => setSaved(true)}
              className="min-h-11 w-full rounded-lg bg-lp-brand px-3 text-sm font-bold text-lp-on-brand outline-none hover:bg-lp-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-brand"
            >
              {t("rollCall.save")}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <ParentCard absent={marks.salma === "absent"} />
          <MiniTimetable />
        </div>
      </div>
    </div>
  );
}

/** What Salma's parent sees: only an absence is sent (10 minutes after the roll call). */
function ParentCard({ absent }: { absent: boolean }) {
  const t = useTranslations("landing.hero.parent");
  return (
    <div className="rounded-2xl bg-lp-surface p-4 text-lp-ink shadow-xl">
      <p className="mb-3 flex items-center gap-2 text-sm font-bold text-lp-muted">
        <BellRing className="size-4" aria-hidden />
        {t("title")}
      </p>
      <div aria-live="polite" className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            absent ? "bg-lp-absent-bg text-lp-absent" : "bg-lp-tint text-lp-brand",
          )}
        >
          {absent ? <CalendarX2 className="size-5" aria-hidden /> : <CircleCheck className="size-5" aria-hidden />}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-bold">{absent ? t("absent") : t("nothing")}</span>
          <span className="text-xs text-lp-muted">{absent ? t("sent") : t("nothingDetail")}</span>
        </span>
      </div>
    </div>
  );
}
