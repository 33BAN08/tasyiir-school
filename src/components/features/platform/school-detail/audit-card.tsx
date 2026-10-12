import { History } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/layout/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { AuditEntry } from "@/lib/platform/school-detail";

/** Latest audited actions on this school (newest first). */
export function AuditCard({ entries }: { entries: AuditEntry[] }) {
  const t = useTranslations("platform.schoolDetail.audit");

  // Action keys are dotted ("school.suspend"); message keys use "_" (dots mean nesting).
  const label = (action: string) => {
    const key = `actions.${action.replaceAll(".", "_")}`;
    return t.has(key) ? t(key) : action;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <EmptyState icon={History} title={t("emptyTitle")} description={t("emptyDescription")} />
        ) : (
          <ol className="flex flex-col gap-3">
            {entries.map((e) => (
              <li key={e.id} className="flex flex-col gap-0.5 border-s-2 border-border ps-3">
                <p className="text-sm font-medium">{label(e.action)}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-numeric tabular-nums">{formatDateTime(e.createdAt)}</span>
                  {e.actorName && <> · {e.actorName}</>}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
