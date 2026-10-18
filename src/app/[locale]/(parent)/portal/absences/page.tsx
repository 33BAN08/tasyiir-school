import { ArrowLeft, CalendarCheck, Clock, X } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { JustificationItem } from "@/components/features/justifications/justification-item";
import { JustifyDialog } from "@/components/features/justifications/justify-dialog";
import { StateBadge } from "@/components/features/justifications/state-badge";
import { EmptyState } from "@/components/layout/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { schoolClock } from "@/lib/attendance/clock";
import { periodRange } from "@/lib/attendance/periods";
import { yearOf } from "@/lib/attendance/staff";
import { requireArea } from "@/lib/auth/session";
import { formatDate, isolate, ltr } from "@/lib/format";
import { getChildAbsences } from "@/lib/justifications/parent";
import { listMyChildren } from "@/lib/parents/portal";
import { listAcademicYears } from "@/lib/structure/academic-years";
import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import { studentName } from "@/lib/students/names";
import { cn } from "@/lib/utils";

/** The most recent absences shown (the year's totals count all of them). */
const SHOWN = 60;

/**
 * A child's absences and late arrivals this school year for the parent
 * (mobile-first), with where each justification stands, and the form to send
 * a new one. RLS gives a parent only their own children's data.
 */
export default async function PortalAbsencesPage({ searchParams }: PageProps<"/[locale]/portal/absences">) {
  const user = await requireArea("portal");
  const [t, locale, sp] = await Promise.all([getTranslations("portal.absences"), getLocale(), searchParams]);
  const children = user.schoolId ? await listMyChildren(user.schoolId) : [];
  const child = children.find((c) => c.id === sp.child) ?? children[0];
  const [clock, years] = user.schoolId ? await Promise.all([schoolClock(), listAcademicYears(user.schoolId)]) : [null, []];
  // The year of the school's today (from the database), else the most recent one.
  const year = clock ? (yearOf(years, clock.date) ?? years[0]) : undefined;

  const back = (
    <Button asChild variant="ghost" size="sm" className="self-start">
      <Link href="/portal">
        <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
        {t("back")}
      </Link>
    </Button>
  );
  if (!child || !user.schoolId || !year || !clock) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <Card className="py-0">
          <EmptyState icon={CalendarCheck} title={t("noChildTitle")} description={t("noChildDescription")} />
        </Card>
      </div>
    );
  }

  const { from, to } = periodRange("year", clock.date, year);
  const { marks, justifications } = await getChildAbsences(user.schoolId, child.id, from, to);
  const name = studentName(child, locale);
  const absences = marks.filter((m) => m.status === "absent");
  const unjustified = absences.filter((m) => m.state !== "justified").length;
  const lates = marks.length - absences.length;

  const justify = (date?: string, small = false) => (
    <JustifyDialog
      schoolId={user.schoolId!}
      studentId={child.id}
      childName={name}
      today={clock.date}
      date={date}
      variant={small ? "ghost" : "default"}
      size={small ? "sm" : "default"}
      label={small ? t("justifyThis") : undefined}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        {back}
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {children.length > 1 && (
          <nav aria-label={t("children")} className="flex flex-wrap gap-2">
            {children.map((c) => (
              <Link
                key={c.id}
                href={`/portal/absences?child=${c.id}`}
                aria-current={c.id === child.id ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-full border px-4 text-sm",
                  c.id === child.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                <bdi>{studentName(c, locale)}</bdi>
              </Link>
            ))}
          </nav>
        )}
        <p className="text-muted-foreground">{t("of", { name: isolate(name), year: ltr(year.label) })}</p>
      </div>

      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border p-3">
          <dt className="text-sm text-muted-foreground">{t("absences")}</dt>
          <dd className={cn("text-lg font-semibold tabular-nums", absences.length > 0 && "text-danger")}>
            {absences.length > 0 ? t("absenceCount", { count: absences.length }) : t("none")}
          </dd>
          {unjustified > 0 && <dd className="text-sm text-muted-foreground">{t("unjustified", { count: unjustified })}</dd>}
        </div>
        <div className="rounded-lg border p-3">
          <dt className="text-sm text-muted-foreground">{t("lates")}</dt>
          <dd className={cn("text-lg font-semibold tabular-nums", lates > 0 && "text-warning")}>
            {lates > 0 ? t("lateCount", { count: lates }) : t("none")}
          </dd>
        </div>
      </dl>

      <div>{justify()}</div>

      <Card>
        <CardHeader>
          <CardTitle>{t("sentTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {justifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("sentEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {justifications.map((j) => (
                <JustificationItem
                  key={j.id}
                  id={j.id}
                  status={j.status}
                  fromDate={j.fromDate}
                  toDate={j.toDate}
                  reason={j.reason}
                  hasFile={j.hasFile}
                  reviewNote={j.reviewNote}
                  canCancel={j.kind === "days"}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {marks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("listEmpty")}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {marks.slice(0, SHOWN).map((m) => (
                <li key={m.sessionId} data-state={m.state} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="font-medium tabular-nums">{ltr(formatDate(m.date))}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">{ltr(m.start)}</span>
                    </span>
                    <span
                      className={cn(
                        "flex items-center gap-1 text-sm font-medium",
                        m.status === "absent" ? "text-danger" : "text-warning",
                      )}
                    >
                      {m.status === "absent" ? <X className="size-4" aria-hidden /> : <Clock className="size-4" aria-hidden />}
                      {m.status === "absent" ? t("absent") : m.minutesLate ? t("lateMinutes", { minutes: m.minutesLate }) : t("late")}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                      <span className={cn("size-2 shrink-0 rounded-full", SUBJECT_SWATCH[m.subjectColor])} aria-hidden />
                      <bdi className="truncate">{m.subjectName}</bdi>
                    </span>
                    <span className="flex items-center gap-2">
                      <StateBadge state={m.state} />
                      {m.state !== "justified" && m.state !== "pending" && justify(m.date, true)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {marks.length > SHOWN && <p className="mt-3 text-xs text-muted-foreground">{t("more", { count: marks.length - SHOWN })}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
