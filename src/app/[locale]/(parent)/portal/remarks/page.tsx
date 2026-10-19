import { MessageSquareText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { RemarkItem } from "@/components/features/remarks/remark-item";
import { BackLink } from "@/components/layout/back-link";
import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { getModules } from "@/lib/auth/modules";
import { requireArea } from "@/lib/auth/session";
import { isolate } from "@/lib/format";
import { listMyChildren } from "@/lib/parents/portal";
import { listStudentRemarks } from "@/lib/remarks/queries";
import { studentName } from "@/lib/students/names";
import { cn } from "@/lib/utils";

/**
 * A child's remarks from the school (mobile-first), newest first; the parent
 * marks each one "Lu". RLS gives a parent only their own children's remarks.
 */
export default async function PortalRemarksPage({ searchParams }: PageProps<"/[locale]/portal/remarks">) {
  const user = await requireArea("portal");
  const [t, locale, sp, modules] = await Promise.all([getTranslations("remarks"), getLocale(), searchParams, getModules()]);
  const children = user.schoolId ? await listMyChildren(user.schoolId) : [];
  const child = children.find((c) => c.id === sp.child) ?? children[0];
  const back = <BackLink href="/portal" label={t("backHome")} />;

  if (!child || !modules.has("messaging")) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Card className="py-0">
          <EmptyState
            icon={MessageSquareText}
            title={t(child ? "notInPlanTitle" : "noChildTitle")}
            description={t(child ? "notInPlanDescription" : "noChildDescription")}
          />
        </Card>
      </div>
    );
  }

  const remarks = await listStudentRemarks(child.id);
  const name = studentName(child, locale);
  const unread = remarks.filter((r) => !r.readAt).length;

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
                href={`/portal/remarks?child=${c.id}`}
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
        <p className="text-muted-foreground">
          {t("of", { name: isolate(name) })}
          {unread > 0 && ` · ${t("unreadCount", { count: unread })}`}
        </p>
      </div>
      <Card>
        <CardContent>
          {remarks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("emptyParent")}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {remarks.map((r) => (
                <RemarkItem key={r.id} remark={r} mode="parent" userId={user.id} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
