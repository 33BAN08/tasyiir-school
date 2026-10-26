import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { ReportCardView } from "@/components/features/report-cards/report-card-view";
import { BackLink } from "@/components/layout/back-link";
import { getModules } from "@/lib/auth/modules";
import { requireArea } from "@/lib/auth/session";
import { isolate } from "@/lib/format";
import { getChildCard } from "@/lib/grades/publications";
import { listMyChildren } from "@/lib/parents/portal";
import { studentName } from "@/lib/students/names";

/**
 * One published report card of one of the parent's children (opened from the
 * list or from the "notes publiées" notification). Another child's, an
 * unpublished or a withdrawn card = not found (RLS returns nothing).
 */
export default async function PortalReportCardPage({ params, searchParams }: PageProps<"/[locale]/portal/grades/[publication]">) {
  const user = await requireArea("portal");
  const [{ publication }, sp, t, locale, modules] = await Promise.all([
    params, searchParams, getTranslations("reportCards"), getLocale(), getModules(),
  ]);
  const children = user.schoolId ? await listMyChildren(user.schoolId) : [];
  const child = children.find((c) => c.id === sp.child) ?? children[0];
  const card = child && modules.has("grades") && /^[0-9a-f-]{36}$/i.test(publication)
    ? await getChildCard(child.id, publication)
    : null;
  if (!child || !card) notFound();

  return (
    <div className="flex flex-col gap-4">
      <BackLink href={`/portal/grades?child=${child.id}`} label={t("backList")} />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("cardTitle")}</h1>
        <p className="text-muted-foreground">{t("of", { name: isolate(studentName(child, locale)) })}</p>
      </div>
      <ReportCardView card={card} />
    </div>
  );
}
