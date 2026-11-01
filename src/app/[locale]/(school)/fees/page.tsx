import { CalendarRange, CircleCheck, Download, Wallet } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FeesTabs } from "@/components/features/fees/fees-tabs";
import { ReportSkeleton } from "@/components/features/fees/report-skeleton";
import { UnpaidFilters } from "@/components/features/fees/unpaid-filters";
import { UnpaidList } from "@/components/features/fees/unpaid-list";
import { YearSelect } from "@/components/features/setup/year-select";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getModules } from "@/lib/auth/modules";
import { getPermissions, requireSchoolPermission } from "@/lib/auth/session";
import { formatCentimes } from "@/lib/fees/money";
import { unpaidMonthFilter } from "@/lib/fees/report-rules";
import { getUnpaid } from "@/lib/fees/reports";
import { getFeeMonths } from "@/lib/fees/setup";
import { formatDate, formatMonth, ltr } from "@/lib/format";
import { listAcademicYears } from "@/lib/structure/academic-years";
import { compareClassNames } from "@/lib/structure/class-names";
import { listClasses } from "@/lib/structure/classes";

type Params = { year?: string; class?: string; month?: string };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Unpaid list (Phase 13 step 7): students who owe money today (the database's
 * date), by class and month, with their parents' phone (students.view).
 * fees.view + the fees module.
 */
export default async function UnpaidPage({ searchParams }: PageProps<"/[locale]/fees">) {
  const user = await requireSchoolPermission("fees.view");
  const t = await getTranslations("fees");
  const params = searchParams.then((sp): Params => ({ year: one(sp.year), class: one(sp.class), month: one(sp.month) }));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("unpaid.description")} />
      <FeesTabs active="unpaid" />
      <Suspense fallback={<ReportSkeleton />}>
        <Unpaid schoolId={user.schoolId} params={params} />
      </Suspense>
    </div>
  );
}

async function Unpaid({ schoolId, params }: { schoolId: string; params: Promise<Params> }) {
  const [modules, permissions, years, p, t, locale] = await Promise.all([
    getModules(), getPermissions(), listAcademicYears(schoolId), params, getTranslations("fees"), getLocale(),
  ]);
  if (!modules.has("fees")) {
    return (
      <Card className="py-0">
        <EmptyState icon={Wallet} title={t("notInPlanTitle")} description={t("notInPlanDescription")} />
      </Card>
    );
  }
  const year = years.find((y) => y.id === p.year) ?? years.find((y) => y.isCurrent) ?? years[0];
  if (!year) {
    return (
      <Card className="py-0">
        <EmptyState icon={CalendarRange} title={t("noYearTitle")} description={t("noYearDescription")} />
      </Card>
    );
  }
  const [classes, feeMonths] = await Promise.all([listClasses(schoolId, year.id), getFeeMonths(year.id)]);
  const billed = feeMonths?.months ?? [];
  const classId = classes.some((c) => c.id === p.class) ? p.class! : null;
  const monthFilter = unpaidMonthFilter(p.month, billed);
  const showGuardians = permissions.has("students.view") || permissions.has("students.manage");
  const list = await getUnpaid(schoolId, year.id, { classId, ...monthFilter }, showGuardians);
  const monthParam = monthFilter.registration ? "registration" : monthFilter.month ? monthFilter.month.slice(0, 7) : null;
  const exportQuery = new URLSearchParams({ report: "unpaid", year: year.id });
  if (classId) exportQuery.set("class", classId);
  if (monthParam) exportQuery.set("month", monthParam);
  const filtered = !!classId || !!monthParam;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <UnpaidFilters
          yearId={year.id}
          classes={[...classes].sort((a, b) => compareClassNames(a.name, b.name)).map((c) => ({ id: c.id, name: c.name }))}
          months={billed.map((m) => ({ value: m.slice(0, 7), label: formatMonth(m.slice(0, 7), locale) }))}
          classId={classId}
          month={monthParam}
        />
        <YearSelect years={years} value={year.id} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4" data-unpaid-summary data-total={list.total} data-count={list.rows.length}>
        <div className="flex flex-col">
          <span className="text-sm text-muted-foreground">{t("unpaid.total")} · {t("unpaid.asOf", { date: ltr(formatDate(list.today)) })}</span>
          <span className="font-numeric text-2xl font-bold tabular-nums">{formatCentimes(list.total)}</span>
          <span className="text-sm text-muted-foreground">{t("unpaid.students", { count: list.rows.length })}</span>
        </div>
        {list.rows.length > 0 && (
          <Button asChild variant="outline" className="min-h-11">
            <a href={`/${locale}/fees/export?${exportQuery}`} download data-unpaid-export>
              <Download aria-hidden />
              {t("unpaid.export")}
            </a>
          </Button>
        )}
      </div>

      {list.rows.length === 0 ? (
        <Card className="py-0">
          <EmptyState
            icon={CircleCheck}
            title={t(filtered ? "unpaid.emptyFiltered" : "unpaid.empty")}
            description={t("unpaid.asOf", { date: ltr(formatDate(list.today)) })}
          />
        </Card>
      ) : (
        <UnpaidList rows={list.rows} yearId={year.id} showGuardians={showGuardians} />
      )}
    </section>
  );
}
