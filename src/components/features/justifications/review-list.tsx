import { Inbox } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { REVIEW_LIMIT, REVIEW_STATUSES, type ReviewItem as Item, type ReviewStatus } from "@/lib/justifications/staff";
import { studentName } from "@/lib/students/names";
import { cn } from "@/lib/utils";

import { ReviewItem } from "./review-item";

type Props = {
  items: Item[];
  counts: Record<ReviewStatus, number>;
  status: ReviewStatus;
  /** attendance.manage: may approve, reject, reopen and remove. */
  canManage: boolean;
};

/** What parents sent (and what the school entered from paper notes), by state; pending first. */
export async function ReviewList({ items, counts, status, canManage }: Props) {
  const [t, locale] = await Promise.all([getTranslations("absences.justifications"), getLocale()]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <nav aria-label={t("filters.label")} className="flex flex-wrap gap-2">
        {REVIEW_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/absences?view=justifications&status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm",
              s === status ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {t(`filters.${s}`)}
            <span className="tabular-nums">{counts[s]}</span>
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <Card className="py-0">
          <EmptyState icon={Inbox} title={t(`empty.${status}`)} description={t("emptyDescription")} />
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" data-testid="review-list">
          {items.map((j) => (
            <ReviewItem
              key={j.id}
              id={j.id}
              studentId={j.studentId}
              name={studentName(j, locale)}
              className={j.className}
              kind={j.kind}
              status={j.status}
              fromDate={j.fromDate}
              toDate={j.toDate}
              reason={j.reason}
              hasFile={j.hasFile}
              reviewNote={j.reviewNote}
              canManage={canManage}
            />
          ))}
        </ul>
      )}
      {counts[status] > REVIEW_LIMIT && <p className="text-xs text-muted-foreground">{t("more", { count: REVIEW_LIMIT })}</p>}
    </div>
  );
}
