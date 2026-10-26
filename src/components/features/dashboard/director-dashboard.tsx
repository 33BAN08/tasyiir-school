import { CalendarX2, Clock, ClipboardCheck, FileCheck2, Lock, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import type { SchoolClock } from "@/lib/attendance/clock";
import { cardPeriodName } from "@/lib/grades/card-title";
import { formatDate, ltr } from "@/lib/format";
import type { DashboardData } from "@/lib/dashboard/director";
import { cn } from "@/lib/utils";

import { BarList, DashCard, StatTile } from "./dashboard-parts";

type Props = { data: DashboardData; clock: SchoolClock; yearId: string | null };

const percent = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

/**
 * The school's dashboard (director, surveillance, office). Phones: one column
 * in priority order; from lg up a 3-column grid (lg:order-*). Only the blocks
 * the user may see are in `data` (permission + module); nothing else is drawn.
 */
export async function DirectorDashboard({ data, clock, yearId }: Props) {
  const t = await getTranslations("dashboard");
  const tp = await getTranslations("grades.periods");
  const { attendance: att, grades, counts } = data;
  const day = `date=${clock.date}`;

  return (
    <div className="flex flex-col gap-4">
      {att && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile name="absent" icon={CalendarX2} tone="danger" label={t("tiles.absent")} value={String(att.today.absentStudents)}
            sub={t("tiles.absentSessions", { count: att.today.absentMarks })} href={`/absences?view=day&${day}`} />
          <StatTile name="late" icon={Clock} tone="warning" label={t("tiles.late")} value={String(att.today.lateMarks)}
            href={`/absences?view=day&${day}`} />
          <StatTile name="rollCalls" icon={ClipboardCheck} tone="info" label={t("tiles.rollCalls")} value={String(att.waiting.length)}
            sub={t("tiles.rollCallsOf", { count: att.lessonsToday })} href="#dash-waiting" />
          <StatTile name="justifications" icon={FileCheck2} tone="brand" label={t("tiles.justifications")} value={String(att.justificationsPending)}
            href="/absences?view=justifications&status=pending" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {att && (
          <DashCard name="waiting" title={t("waiting.title")} className="lg:order-1 lg:col-span-2">
            {att.waiting.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t(att.lessonsToday === 0 ? "waiting.noLessons" : "waiting.none")}</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {att.waiting.slice(0, 8).map((w) => (
                  <li key={w.lessonId}>
                    <Link href={`/absences?view=day&class=${w.classId}&${day}`} data-waiting={w.lessonId}
                      className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm hover:bg-muted/50">
                      <span className="font-numeric tabular-nums text-muted-foreground">{ltr(w.start)}</span>
                      <span className="font-medium" dir="auto">{w.className}</span>
                      <span dir="auto">{w.subjectName}</span>
                      <span className="ms-auto text-muted-foreground" dir="auto">{w.teacherName}</span>
                    </Link>
                  </li>
                ))}
                {att.waiting.length > 8 && <li className="pt-2 text-xs text-muted-foreground">{t("waiting.more", { count: att.waiting.length - 8 })}</li>}
              </ul>
            )}
          </DashCard>
        )}

        {att && (
          <DashCard name="week" title={t("week.title")} className="lg:order-2">
            <WeekRow label={t("week.absences")} now={att.week.absentMarks} before={att.lastWeek.absentMarks} t={t} name="absences" />
            <WeekRow label={t("week.lates")} now={att.week.lateMarks} before={att.lastWeek.lateMarks} t={t} name="lates" />
            <p className="text-xs text-muted-foreground">{t("week.note")}</p>
          </DashCard>
        )}

        {att && (
          <DashCard name="topClasses" title={t("top.title")} className="lg:order-5 lg:col-span-2">
            {att.topClasses.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("top.none")}</p>
            ) : (
              <BarList name="topClasses" rows={att.topClasses.map((c) => ({
                key: c.classId, label: c.className, value: c.absentMarks, display: String(c.absentMarks),
                href: `/absences?view=totals&class=${c.classId}&period=month`, max: att.topClasses[0].absentMarks,
              }))} />
            )}
          </DashCard>
        )}

        {grades && (
          <DashCard name="gradeProgress" className="lg:order-3 lg:col-span-2"
            title={t("progress.title", { period: cardPeriodName({ periodNumber: grades.periodNumber, periodCount: grades.periodCount }, tp) })}
            action={yearId ? { href: `/grades/averages?year=${yearId}&period=${grades.periodId}`, label: t("progress.all") } : undefined}>
            {grades.progress.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("progress.none")}</p>
            ) : (
              <BarList name="gradeProgress" rows={grades.progress.slice(0, 8).map((p) => ({
                key: p.classId, label: p.className, value: p.entered, display: ltr(`${percent(p.entered, p.expected)} %`),
                sub: ltr(`${p.entered}/${p.expected}`), href: `/grades/averages?year=${yearId}&class=${p.classId}&period=${grades.periodId}`, max: p.expected,
              }))} />
            )}
          </DashCard>
        )}

        {grades && (
          <DashCard name="publications" title={t("publications.title")} className="lg:order-4">
            {!grades.locked ? (
              <p className="flex items-start gap-2 text-sm text-muted-foreground" data-publications-state="open">
                <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
                {t("publications.notLocked")}
              </p>
            ) : grades.toPublish.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-publications-state="done">{t("publications.allPublished")}</p>
            ) : (
              <ul className="flex flex-col divide-y text-sm" data-publications-state="todo">
                {grades.toPublish.slice(0, 6).map((c) => (
                  <li key={c.classId}>
                    <Link href={`/grades/averages?year=${yearId}&class=${c.classId}&period=${grades.periodId}`} data-to-publish={c.classId}
                      className="flex min-h-11 items-center justify-between gap-2 py-2 hover:bg-muted/50">
                      <span className="font-medium" dir="auto">{c.className}</span>
                      <span className="text-xs text-warning">{t("publications.lockedNotPublished")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">{t("publications.published", { count: grades.published })}</p>
          </DashCard>
        )}

        {counts && (
          <DashCard name="counts" title={t("counts.title")} className="lg:order-6">
            <dl className="grid grid-cols-3 gap-2 text-center">
              {counts.students !== null && <Count label={t("counts.students")} value={counts.students} name="students" />}
              <Count label={t("counts.classes")} value={counts.classes} name="classes" />
              {counts.teachers !== null && <Count label={t("counts.teachers")} value={counts.teachers} name="teachers" />}
            </dl>
          </DashCard>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("asOf", { date: ltr(formatDate(clock.date)), time: ltr(clock.time) })}</p>
    </div>
  );
}

function Count({ label, value, name }: { label: string; value: number; name: string }) {
  return (
    <div className="flex flex-col rounded-lg bg-muted/50 p-2" data-count={name} data-value={value}>
      <dd className="font-numeric text-2xl font-bold tabular-nums">{value}</dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"dashboard">>>;

/** This week vs the same days last week: the number, then the change in words + an icon (never colour alone). */
function WeekRow({ label, now, before, t, name }: { label: string; now: number; before: number; t: T; name: string }) {
  const change = before === 0 ? null : Math.round(((now - before) / before) * 100);
  const Icon = change === null || change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown;
  return (
    <div className="flex items-center justify-between gap-3" data-week={name} data-now={now} data-before={before}>
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-2 text-sm">
        <span className="font-numeric text-xl font-bold tabular-nums">{now}</span>
        <span className={cn("flex items-center gap-1 text-xs", change !== null && change > 0 ? "text-danger" : "text-muted-foreground")}>
          <Icon className="size-3.5" aria-hidden />
          {change === null ? t("week.noBase", { before }) : t("week.change", { change: ltr(change > 0 ? `+${change}` : String(change)), before })}
        </span>
      </span>
    </div>
  );
}
