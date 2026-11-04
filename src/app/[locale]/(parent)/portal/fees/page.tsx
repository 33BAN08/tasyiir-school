import { Wallet } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { ParentFeeMonths } from "@/components/features/fees/parent-fee-months";
import { ParentFeeReceipts } from "@/components/features/fees/parent-fee-receipts";
import { BackLink } from "@/components/layout/back-link";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { getModules } from "@/lib/auth/modules";
import { requireArea } from "@/lib/auth/session";
import { ledgerTotals } from "@/lib/fees/ledger";
import { formatCentimes } from "@/lib/fees/money";
import { listMyChildrenFees, pickFeeYear } from "@/lib/fees/parent";
import { isolate, ltr } from "@/lib/format";
import { listMyChildren } from "@/lib/parents/portal";
import { studentName } from "@/lib/students/names";
import { cn } from "@/lib/utils";

/**
 * A child's fees for a parent (Phase 13 step 8): the year's totals, the months
 * (read-only) and the receipts. Read only through my_children_fees: parents
 * have no access to the fee tables. Students share this area and get nothing.
 */
export default async function PortalFeesPage({ searchParams }: PageProps<"/[locale]/portal/fees">) {
  const user = await requireArea("portal");
  const [t, tLedger, locale, sp, modules] = await Promise.all([
    getTranslations("portal.fees"), getTranslations("fees.student.ledger"), getLocale(), searchParams, getModules(),
  ]);
  if (user.roleKey !== "parent") return redirect({ href: "/portal", locale });

  const children = user.schoolId ? await listMyChildren(user.schoolId) : [];
  const child = children.find((c) => c.id === sp.child) ?? children[0];
  const back = <BackLink href={child ? `/portal?child=${child.id}` : "/portal"} label={t("backHome")} />;
  const inPlan = modules.has("fees");

  const years = child && inPlan ? (await listMyChildrenFees()).filter((r) => r.studentId === child.id) : [];
  const shown = pickFeeYear(years, sp.year);
  const heading = (
    <div className="flex flex-col gap-3">
      {back}
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {child && inPlan && children.length > 1 && (
        <nav aria-label={t("children")} className="flex flex-wrap gap-2">
          {children.map((c) => (
            <Chip key={c.id} href={`/portal/fees?child=${c.id}`} current={c.id === child.id}>
              <bdi>{studentName(c, locale)}</bdi>
            </Chip>
          ))}
        </nav>
      )}
      {child && inPlan && <p className="text-muted-foreground">{t("of", { name: isolate(studentName(child, locale)) })}</p>}
    </div>
  );

  if (!child || !inPlan || !shown) {
    const key = !child ? "noChild" : !inPlan ? "notInPlan" : "empty";
    return (
      <div className="flex flex-col gap-5">
        {heading}
        <Card className="py-0">
          <EmptyState icon={Wallet} title={t(`${key}Title`)} description={t(`${key}Description`)} />
        </Card>
      </div>
    );
  }

  const totals = ledgerTotals(shown.charges, shown.today);
  const facts: { key: string; label: string; value: number; tone?: string }[] = [
    { key: "total", label: tLedger("total"), value: totals.total },
    { key: "paid", label: tLedger("paid"), value: totals.paid, tone: "text-success" },
    { key: "balance", label: tLedger("balance"), value: totals.balance },
    { key: "due", label: tLedger("dueNow"), value: totals.dueNow, tone: totals.dueNow > 0 ? "text-danger" : undefined },
  ];

  return (
    <div className="flex flex-col gap-5" data-parent-fees={child.id} data-fee-year={shown.yearId}>
      {heading}
      {years.length > 1 ? (
        <nav aria-label={t("years")} className="flex flex-wrap gap-2">
          {years.map((y) => (
            <Chip key={y.yearId} href={`/portal/fees?child=${child.id}&year=${y.yearId}`} current={y.yearId === shown.yearId}>
              {ltr(y.yearLabel)}
            </Chip>
          ))}
        </nav>
      ) : (
        <p className="text-sm font-medium">{ltr(shown.yearLabel)}</p>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-fee-totals>
        {facts.map((f) => (
          <div key={f.key} className="flex flex-col gap-1 rounded-xl border bg-card p-3" data-fee-fact={f.key} data-amount={f.value}>
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className={cn("font-numeric font-semibold tabular-nums", f.tone)}>{formatCentimes(f.value)}</dd>
          </div>
        ))}
      </dl>

      {shown.charges.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="parent-fee-months">
          <h2 id="parent-fee-months" className="font-semibold">{t("monthsTitle")}</h2>
          <ParentFeeMonths charges={shown.charges} today={shown.today} />
        </section>
      )}

      <section className="flex flex-col gap-1" aria-labelledby="parent-fee-receipts">
        <h2 id="parent-fee-receipts" className="font-semibold">{t("receiptsTitle")}</h2>
        <ParentFeeReceipts receipts={shown.receipts} />
      </section>

      <p className="text-sm text-muted-foreground">{t("payAtSchool")}</p>
    </div>
  );
}

function Chip({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-sm",
        current ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
      )}
    >
      {children}
    </Link>
  );
}
