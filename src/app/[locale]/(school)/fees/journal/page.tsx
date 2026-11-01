import { Download, Wallet } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { FeesTabs } from "@/components/features/fees/fees-tabs";
import { JournalRange } from "@/components/features/fees/journal-range";
import { JournalView } from "@/components/features/fees/journal-view";
import { ReportSkeleton } from "@/components/features/fees/report-skeleton";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { schoolClock } from "@/lib/attendance/clock";
import { getModules } from "@/lib/auth/modules";
import { requireSchoolPermission } from "@/lib/auth/session";
import { journalRange } from "@/lib/fees/report-rules";
import { getJournal } from "@/lib/fees/reports";
import { formatDate, ltr } from "@/lib/format";

type Params = { from?: string; to?: string };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Payments journal (Phase 13 step 7): the receipts of a period (this month by
 * default, the database's date), totals per method, cheques, cancellations.
 * fees.view + the fees module.
 */
export default async function JournalPage({ searchParams }: PageProps<"/[locale]/fees/journal">) {
  const user = await requireSchoolPermission("fees.view");
  const t = await getTranslations("fees");
  const params = searchParams.then((sp): Params => ({ from: one(sp.from), to: one(sp.to) }));
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("title")} description={t("journal.description")} />
      <FeesTabs active="journal" />
      <Suspense fallback={<ReportSkeleton />}>
        <JournalSection schoolId={user.schoolId} params={params} />
      </Suspense>
    </div>
  );
}

async function JournalSection({ schoolId, params }: { schoolId: string; params: Promise<Params> }) {
  const [modules, clock, p, t, locale] = await Promise.all([getModules(), schoolClock(), params, getTranslations("fees"), getLocale()]);
  if (!modules.has("fees")) {
    return (
      <Card className="py-0">
        <EmptyState icon={Wallet} title={t("notInPlanTitle")} description={t("notInPlanDescription")} />
      </Card>
    );
  }
  const range = journalRange(p.from, p.to, clock.date);
  const journal = await getJournal(schoolId, range.from, range.to);
  const exportQuery = new URLSearchParams({ report: "journal", from: range.from, to: range.to });

  return (
    <section className="flex flex-col gap-4" data-journal-from={range.from} data-journal-to={range.to}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        {/* key: a new range from the URL resets the form's values. */}
        <JournalRange key={`${range.from}:${range.to}`} from={range.from} to={range.to} />
        {journal.payments.length + journal.cancellations.length > 0 && (
          <Button asChild variant="outline" className="min-h-11">
            <a href={`/${locale}/fees/export?${exportQuery}`} download data-journal-export>
              <Download aria-hidden />
              {t("journal.export")}
            </a>
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {t("journal.period", { from: ltr(formatDate(range.from)), to: ltr(formatDate(range.to)) })}
      </p>
      <JournalView journal={journal} />
    </section>
  );
}
