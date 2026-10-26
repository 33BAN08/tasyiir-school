"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { saveCouncilRemarks } from "@/lib/grades/council-actions";
import { cn } from "@/lib/utils";

import type { SheetRowStudent } from "./sheet-types";

const MAX = 500;

type Props = {
  classId: string;
  /** null = the year. */
  periodId: string | null;
  students: SheetRowStudent[];
  /** Saved remarks by student. */
  remarks: Record<string, string>;
  canEdit: boolean;
};

/**
 * One class-council remark per student (the director writes them after the
 * council). Typing stays on the page; "Enregistrer" sends every changed box
 * in one call. They reach the report card when the semester is (re)published.
 */
export function CouncilSheet({ classId, periodId, students, remarks, canEdit }: Props) {
  const t = useTranslations("councilRemarks");
  const tErrors = useTranslations("councilRemarks.errors");
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>(remarks);
  const [isSaving, startSaving] = useTransition();
  const changed = useMemo(
    () => students.filter((s) => (draft[s.id] ?? "").trim() !== (remarks[s.id] ?? "")).map((s) => s.id),
    [students, draft, remarks],
  );
  const tooLong = students.some((s) => (draft[s.id] ?? "").trim().length > MAX);

  useEffect(() => {
    if (changed.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed.length]);

  const save = () =>
    startSaving(async () => {
      const result = await saveCouncilRemarks(classId, periodId, changed.map((id) => ({ studentId: id, body: draft[id] ?? "" })));
      if (!result.ok) {
        const k = result.error as Parameters<typeof tErrors>[0];
        return void toast.error(tErrors.has(k) ? tErrors(k) : tErrors("generic"));
      }
      toast.success(t("saved", { count: changed.length }));
      router.refresh();
    });

  if (students.length === 0) return <p className="text-muted-foreground">{t("noStudents")}</p>;

  return (
    <div className="flex flex-col gap-3">
      <Card className="gap-0 py-0">
        <ul className="divide-y">
          {students.map((s) => {
            const value = draft[s.id] ?? "";
            const dirty = changed.includes(s.id);
            return (
              <li key={s.id} data-student={s.id} className="flex flex-col gap-2 px-4 py-3 md:grid md:grid-cols-[14rem_1fr] md:gap-4">
                <div className="flex min-w-0 flex-col">
                  <label htmlFor={`council-${s.id}`} className="truncate font-medium" dir="auto">{s.name}</label>
                  {s.otherName && <span className="truncate text-xs text-muted-foreground" dir="auto">{s.otherName}</span>}
                </div>
                {canEdit ? (
                  <div className="flex flex-col gap-1">
                    <Textarea
                      id={`council-${s.id}`}
                      data-council-input={s.id}
                      value={value}
                      onChange={(e) => setDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                      rows={2}
                      dir="auto"
                      aria-invalid={value.trim().length > MAX}
                      placeholder={t("placeholder")}
                      className={cn(dirty && "border-primary")}
                      disabled={isSaving}
                    />
                    <span className={cn("text-xs text-muted-foreground", value.trim().length > MAX && "text-destructive")}>
                      {value.trim().length}/{MAX}
                    </span>
                  </div>
                ) : (
                  <p className="whitespace-pre-line text-sm" dir="auto" data-council-text={s.id}>
                    {remarks[s.id] || <span className="text-muted-foreground">—</span>}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
      {canEdit && changed.length > 0 && (
        <div data-council-savebar className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-md">
          <div className="flex flex-col text-sm" aria-live="polite">
            <span className="font-medium">{t("pending", { count: changed.length })}</span>
            {tooLong && <span className="text-destructive">{t("tooLong", { max: MAX })}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDraft(remarks)} disabled={isSaving}>{t("cancel")}</Button>
            <Button onClick={save} disabled={isSaving || tooLong}>{isSaving ? t("saving") : t("save")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
