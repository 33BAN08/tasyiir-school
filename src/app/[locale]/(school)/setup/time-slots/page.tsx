import { Clock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense, type ReactNode } from "react";

import { SchoolDayToggles } from "@/components/features/setup/school-day-toggles";
import { SetupTabs } from "@/components/features/setup/setup-tabs";
import { TimeSlotDayCard } from "@/components/features/setup/time-slot-day-card";
import { TimeSlotYearActions } from "@/components/features/setup/time-slot-year-actions";
import { YearSelect } from "@/components/features/setup/year-select";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { requireSchoolPermission } from "@/lib/auth/session";
import { ltr } from "@/lib/format";
import { listAcademicYears } from "@/lib/structure/academic-years";
import { countSlotsByYear, getSchoolWeek } from "@/lib/structure/time-slots";

export default async function TimeSlotsPage({ searchParams }: PageProps<"/[locale]/setup/time-slots">) {
  const user = await requireSchoolPermission("structure.manage");
  const t = await getTranslations("setup");
  const year = searchParams.then((sp) => (typeof sp.year === "string" ? sp.year : undefined));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <SetupTabs />
      <Suspense fallback={<TimeSlotsSkeleton />}>
        <TimeSlotsSection schoolId={user.schoolId} requestedYear={year} />
      </Suspense>
    </div>
  );
}

type SectionProps = { schoolId: string; requestedYear: Promise<string | undefined> };

async function TimeSlotsSection({ schoolId, requestedYear }: SectionProps) {
  const [years, wanted, t] = await Promise.all([
    listAcademicYears(schoolId),
    requestedYear,
    getTranslations("setup.timeSlots"),
  ]);
  // The year asked for, else the current one, else the most recent.
  const year = years.find((y) => y.id === wanted) ?? years.find((y) => y.isCurrent) ?? years[0];

  const header = (actions?: ReactNode) => (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      {actions}
    </div>
  );

  // Slots belong to a year: one is needed first.
  if (!year) {
    return (
      <section className="flex flex-col gap-4">
        {header()}
        <Card className="py-0">
          <EmptyState
            icon={Clock}
            title={t("missingYear.title")}
            description={t("missingYear.description")}
            action={
              <Button asChild>
                <Link href="/setup/years">{t("missingYear.action")}</Link>
              </Button>
            }
          />
        </Card>
      </section>
    );
  }

  const [week, counts] = await Promise.all([getSchoolWeek(schoolId, year.id), countSlotsByYear(schoolId)]);
  const sources = years
    .filter((y) => y.id !== year.id && counts[y.id])
    .map((y) => ({ id: y.id, label: y.label, slots: counts[y.id] }));
  const filledDays = week.days.filter((d) => week.slots.some((s) => s.day === d));
  const lessons = week.slots.filter((s) => s.kind === "lesson").length;

  return (
    <section className="flex flex-col gap-4">
      {header(<YearSelect years={years} value={year.id} />)}

      {week.slots.length === 0 && (
        <Card className="py-0">
          <EmptyState
            icon={Clock}
            title={t("emptyTitle", { year: ltr(year.label) })}
            description={t("emptyDescription")}
            action={<TimeSlotYearActions yearId={year.id} yearLabel={year.label} sources={sources} />}
          />
        </Card>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("daysLabel")}</h3>
        <SchoolDayToggles yearId={year.id} days={week.days} />
        <p className="text-sm text-muted-foreground">
          {week.days.length === 0
            ? t("noDays")
            : t("summary", { days: week.days.length, lessons, year: ltr(year.label) })}
        </p>
      </div>

      {week.days.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {week.days.map((day) => (
            <TimeSlotDayCard
              key={day}
              yearId={year.id}
              day={day}
              slots={week.slots.filter((s) => s.day === day)}
              filledDays={filledDays}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TimeSlotsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-9 w-96 max-w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    </div>
  );
}
