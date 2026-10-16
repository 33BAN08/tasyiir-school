"use client";

import { AlertCircle, CheckCircle2, SkipForward } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { StatusBadge, type StatusStyle } from "@/components/layout/status-badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, ltr } from "@/lib/format";
import { formatMobile, PHONE_PATTERN } from "@/lib/parents/phone";
import type { ImportRowPreview, ImportRowStatus, ImportWarning } from "@/lib/students/import/types";
import { studentName, studentOtherName } from "@/lib/students/names";
import { cn } from "@/lib/utils";

const STATUS: Record<ImportRowStatus, StatusStyle> = {
  ready: { tone: "success", icon: CheckCircle2 },
  exists: { tone: "muted", icon: SkipForward },
  error: { tone: "danger", icon: AlertCircle },
};

type Props = {
  rows: ImportRowPreview[];
  showArabic: boolean;
  showParents: boolean;
  /** Ready lines the user unticked: they will not be imported. */
  excluded: ReadonlySet<number>;
  onToggle: (line: number, include: boolean) => void;
};

/**
 * One line per file row: a tick box on each ready row (ticked = imported), what
 * will be created, every problem in the UI language, and possible duplicates.
 */
export function ImportPreviewTable({ rows, showArabic, showParents, excluded, onToggle }: Props) {
  const t = useTranslations("students.import");
  const tGender = useTranslations("students.form.genders");
  const tRel = useTranslations("parents.relations");
  const locale = useLocale();

  const warningText = (w: ImportWarning) =>
    w.key === "possibleDuplicate"
      ? t(w.codeMassar ? "warnings.possibleDuplicateCode" : "warnings.possibleDuplicate", {
          // Latin name and code kept in order inside an Arabic sentence.
          name: ltr(w.name),
          code: ltr(w.codeMassar ?? ""),
        })
      : t("warnings.possibleDuplicateInFile", { line: w.line });

  const names = (r: ImportRowPreview) => ({
    lastName: r.lastName,
    firstName: r.firstName,
    lastNameAr: showArabic && r.lastNameAr ? r.lastNameAr : null,
    firstNameAr: showArabic && r.firstNameAr ? r.firstNameAr : null,
  });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <span className="sr-only">{t("table.include")}</span>
          </TableHead>
          <TableHead className="w-16">{t("table.line")}</TableHead>
          <TableHead>{t("table.student")}</TableHead>
          <TableHead>{t("table.status")}</TableHead>
          <TableHead>{t("table.birth")}</TableHead>
          <TableHead>{t("table.massar")}</TableHead>
          <TableHead>{t("table.class")}</TableHead>
          {showParents && <TableHead>{t("table.parent")}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const n = names(r);
          const other = studentOtherName(n, locale);
          return (
            <TableRow key={r.line} className={cn("align-top", r.status === "ready" && excluded.has(r.line) && "opacity-60")}>
              <TableCell>
                {r.status === "ready" && (
                  <Checkbox
                    checked={!excluded.has(r.line)}
                    onCheckedChange={(v) => onToggle(r.line, v === true)}
                    aria-label={t("table.includeLine", { line: r.line })}
                  />
                )}
              </TableCell>
              <TableCell className="font-numeric tabular-nums text-muted-foreground">{r.line}</TableCell>
              <TableCell className="whitespace-normal">
                <div className="flex flex-col items-start">
                  <bdi className="font-medium">{studentName(n, locale).trim() || "—"}</bdi>
                  {other && <bdi className="text-xs text-muted-foreground">{other}</bdi>}
                </div>
              </TableCell>
              <TableCell className="min-w-56 whitespace-normal">
                <StatusBadge {...STATUS[r.status]} label={t(`status.${r.status}`)} />
                {r.issues.length > 0 && (
                  <ul className="mt-2 flex list-none flex-col gap-1 text-xs text-danger">
                    {r.issues.map((issue) => (
                      <li key={`${issue.column}-${issue.key}`}>
                        {t.rich("issueLine", {
                          column: t(`columns.${issue.column}`),
                          message: t(`issues.${issue.key}`, { line: issue.line ?? 0 }),
                          strong: (chunks) => <span className="font-medium">{chunks}</span>,
                        })}
                      </li>
                    ))}
                  </ul>
                )}
                {r.warnings.length > 0 && (
                  <ul className="mt-2 flex list-none flex-col gap-1 text-xs text-warning">
                    {r.warnings.map((w) => (
                      <li key={w.key}>
                        <bdi>{warningText(w)}</bdi>
                      </li>
                    ))}
                  </ul>
                )}
                {r.status === "ready" && excluded.has(r.line) && (
                  <p className="mt-2 text-xs text-muted-foreground">{t("table.excluded")}</p>
                )}
              </TableCell>
              <TableCell className="font-numeric tabular-nums">
                {r.birthDate ? formatDate(r.birthDate) : "—"}
                {r.gender && <div className="text-xs text-muted-foreground">{tGender(r.gender)}</div>}
              </TableCell>
              <TableCell className="font-numeric">{r.codeMassar ? <bdi>{r.codeMassar}</bdi> : "—"}</TableCell>
              <TableCell>{r.className ? <bdi>{r.className}</bdi> : "—"}</TableCell>
              {showParents && (
                <TableCell className="whitespace-normal">
                  {r.parent ? (
                    <div className="flex flex-col items-start text-sm">
                      <bdi>{r.parent.existingName ?? `${r.parent.lastName} ${r.parent.firstName}`}</bdi>
                      <span className="text-xs text-muted-foreground">
                        {r.parent.relation && `${tRel(r.parent.relation)} · `}
                        <bdi dir="ltr" className="font-numeric whitespace-nowrap">
                          {PHONE_PATTERN.test(r.parent.phone) ? formatMobile(r.parent.phone) : r.parent.phone}
                        </bdi>
                      </span>
                      {r.parent.existingName && <span className="text-xs text-info">{t("existingParent")}</span>}
                    </div>
                  ) : (
                    "—"
                  )}
                </TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
