import { ChevronRight, GraduationCap } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { PostedAt } from "@/components/features/announcements/posted-at";
import { BackLink } from "@/components/layout/back-link";
import { EmptyState } from "@/components/layout/empty-state";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getModules } from "@/lib/auth/modules";
import { requireArea } from "@/lib/auth/session";
import { isolate } from "@/lib/format";
import { cardTitle } from "@/lib/grades/card-title";
import { formatAverage } from "@/lib/grades/marks";
import { listChildCards } from "@/lib/grades/publications";
import { listMyChildren } from "@/lib/parents/portal";
import { studentName } from "@/lib/students/names";
import { cn } from "@/lib/utils";

/**
 * A child's published report cards (Phase 11 step 7), newest first. RLS gives
 * a parent only their own children's cards; nothing unpublished is readable.
 */
export default async function PortalGradesPage({ searchParams }: PageProps<"/[locale]/portal/grades">) {
  const user = await requireArea("portal");
  const [t, tp, locale, sp, modules] = await Promise.all([
    getTranslations("reportCards"), getTranslations("grades.periods"), getLocale(), searchParams, getModules(),
  ]);
  const children = user.schoolId ? await listMyChildren(user.schoolId) : [];
  const child = children.find((c) => c.id === sp.child) ?? children[0];
  const back = <BackLink href={child ? `/portal?child=${child.id}` : "/portal"} label={t("backHome")} />;

  if (!child || !modules.has("grades")) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Card className="py-0">
          <EmptyState
            icon={GraduationCap}
            title={t(child ? "notInPlanTitle" : "noChildTitle")}
            description={t(child ? "notInPlanDescription" : "noChildDescription")}
          />
        </Card>
      </div>
    );
  }

  const cards = await listChildCards(child.id);
  const name = studentName(child, locale);

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
                href={`/portal/grades?child=${c.id}`}
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
        <p className="text-muted-foreground">{t("of", { name: isolate(name) })}</p>
      </div>

      {cards.length === 0 ? (
        <Card className="py-0">
          <EmptyState icon={GraduationCap} title={t("emptyTitle")} description={t("emptyDescription")} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {cards.map((card) => (
            <li key={card.id}>
              <Link
                href={`/portal/grades/${card.publicationId}?child=${child.id}`}
                data-card-link={card.publicationId}
                className="flex min-h-16 items-center gap-3 rounded-xl border bg-card p-4 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <GraduationCap className="size-5" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{cardTitle(card, tp)}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("publishedOn")} <PostedAt value={card.publishedAt} />
                  </span>
                </span>
                <span className="font-numeric text-lg font-bold tabular-nums">
                  {card.average === null ? "—" : formatAverage(card.average)}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
