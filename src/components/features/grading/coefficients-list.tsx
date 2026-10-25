"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { reorderCoefficients } from "@/lib/grading/coefficient-actions";
import type { CoefficientRow as Row } from "@/lib/grading/setup";
import type { CoefficientScope } from "@/lib/validations/grading";

import { CoefficientRow, type CoefficientSubject } from "./coefficient-row";
import { useGradingError } from "./use-grading-error";

type Props = {
  scope: CoefficientScope;
  subjects: CoefficientSubject[];
  /** Rows of this scope (report card order). */
  rows: Row[];
  /** In a filière: the level's common rows. */
  commonRows: Row[];
  levelControls: number;
  canManage: boolean;
};

/** Graded subjects in report card order, then the school's other subjects. */
export function CoefficientsList({ scope, subjects, rows, commonRows, levelControls, canManage }: Props) {
  const t = useTranslations("grading.coefficients");
  const translateError = useGradingError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const graded = rows.filter((r) => byId.has(r.subjectId));
  const gradedIds = new Set(graded.map((r) => r.subjectId));
  const common = new Map(commonRows.map((r) => [r.subjectId, r]));
  const others = subjects.filter((s) => !gradedIds.has(s.id));

  function move(index: number, by: -1 | 1) {
    const order = graded.map((r) => r.subjectId);
    [order[index], order[index + by]] = [order[index + by], order[index]];
    startTransition(async () => {
      const result = await reorderCoefficients(scope, order);
      if (!result.ok) toast.error(translateError(result.error));
      router.refresh();
    });
  }

  // Remount a row when its saved values change (its inputs start from them).
  const rowKey = (subjectId: string, row: Row | null) =>
    `${subjectId}:${row ? `${row.coefficient}:${row.controlsCount}` : "-"}:${common.get(subjectId)?.coefficient ?? ""}`;

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-0 py-0">
        <div
          aria-hidden
          className="hidden border-b px-4 py-2 text-xs text-muted-foreground md:grid md:grid-cols-[minmax(10rem,1fr)_7rem_7rem_auto] md:gap-4"
        >
          <span>{t("subject")}</span>
          <span>{t("coefficient")}</span>
          <span>{t("controls")}</span>
          <span />
        </div>
        {graded.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">{t(scope.trackId ? "noneInFiliere" : "none")}</p>
        ) : (
          <ol className="divide-y" aria-label={t("gradedLabel")}>
            {graded.map((row, i) => (
              <CoefficientRow
                key={rowKey(row.subjectId, row)}
                scope={scope}
                subject={byId.get(row.subjectId)!}
                row={row}
                common={common.get(row.subjectId) ?? null}
                levelControls={levelControls}
                canManage={canManage}
                move={{
                  up: i > 0 ? () => move(i, -1) : null,
                  down: i < graded.length - 1 ? () => move(i, 1) : null,
                  pending: isPending,
                }}
              />
            ))}
          </ol>
        )}
      </Card>

      {others.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t("others")}</h3>
          <Card className="gap-0 py-0">
            <ul className="divide-y">
              {others.map((subject) => (
                <CoefficientRow
                  key={rowKey(subject.id, null)}
                  scope={scope}
                  subject={subject}
                  row={null}
                  common={common.get(subject.id) ?? null}
                  levelControls={levelControls}
                  canManage={canManage}
                />
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
