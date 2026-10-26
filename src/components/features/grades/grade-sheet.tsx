"use client";

import { CircleAlert, History } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { saveGrades } from "@/lib/grades/actions";
import { deleteGradeDraft, purgeGradeDrafts, readGradeDraft, writeGradeDraft, type GradeDraft } from "@/lib/grades/drafts";
import { formatAverage, markKey, parseMark, partlyEntered, pendingMarks, sameMark, type SheetColumn } from "@/lib/grades/marks";

import { GridSheet } from "./grid-sheet";
import { PhoneSheet } from "./phone-sheet";
import type { CellView, SheetAverage, SheetRowStudent } from "./sheet-types";

type Props = {
  userId: string;
  classId: string;
  subjectId: string;
  periodId: string;
  /** Writes allowed (own pair or grades.manage, semester not locked, subject graded). */
  canEdit: boolean;
  /** The semester is locked: an unsaved copy on this phone can only be discarded. */
  locked: boolean;
  scale: number;
  columns: SheetColumn[];
  students: SheetRowStudent[];
  /** Saved grades: cell key → text. */
  marks: Record<string, string>;
  /** Saved subject averages of the semester, by student (class_averages()); null = not shown. */
  averages: Record<string, number | null> | null;
  /** Marks expected per student for this subject (the sheet's own columns: contrôles + activités). */
  expectedMarks: number;
};

/** Same marks as typed in both copies? ("14,5" = "14.5".) */
function sameDraft(a: GradeDraft, b: GradeDraft, scale: number): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => sameMark(parseMark(a[k] ?? "", scale), parseMark(b[k] ?? "", scale)));
}

/**
 * A grade sheet (class + subject + semester). Typing is instant and kept on the
 * phone until saved; "Enregistrer" sends every changed mark in one transaction.
 * A dropped connection keeps everything on screen and on the phone ("Réessayer").
 */
export function GradeSheet({ userId, classId, subjectId, periodId, canEdit, locked, scale, columns, students, marks, averages, expectedMarks }: Props) {
  const t = useTranslations("grades.sheet");
  const tErrors = useTranslations("grades.errors");
  const router = useRouter();
  const [draft, setDraft] = useState<GradeDraft>(marks);
  /** An unsaved copy of this sheet was found on this phone (merged into the draft). */
  const [foundCopy, setFoundCopy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const errorText = (key: string) => {
    const k = key as Parameters<typeof tErrors>[0];
    return tErrors.has(k) ? tErrors(k) : tErrors("generic");
  };
  const editable = useMemo(() => columns.filter((c) => !c.extra), [columns]);
  const ids = useMemo(() => students.map((s) => s.id), [students]);
  const { cells, invalid } = useMemo(() => pendingMarks(ids, editable, marks, draft, scale), [ids, editable, marks, draft, scale]);
  const dirty = canEdit && cells.length + invalid.size > 0;

  // Once in the browser: other accounts' copies go; an unsaved copy of this sheet comes back.
  useEffect(() => {
    purgeGradeDrafts(userId);
    const copy = readGradeDraft(userId, periodId, classId, subjectId);
    if (copy && !sameDraft(copy, marks, scale)) {
      // Restoring browser-only state after hydration (the server cannot see localStorage).
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the phone's storage, like the roll call
      setDraft(copy);
      setFoundCopy(true);
    }
  }, [userId, periodId, classId, subjectId, marks, scale]);
  // Writable: the copy is back on screen. Locked: it can only be discarded. Read-only (surveillant): ignored.
  const copyState = !foundCopy ? null : canEdit ? "restored" : locked ? "locked" : null;

  // Leaving with unsaved marks: the browser asks first (they also stay on the phone).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setCell = (studentId: string, column: SheetColumn, text: string) => {
    const key = markKey(studentId, column.kind, column.number);
    setFailed(false);
    setDraft((d) => {
      const next = { ...d, [key]: text };
      if (sameDraft(next, marks, scale)) deleteGradeDraft(userId, periodId, classId, subjectId);
      else writeGradeDraft(userId, periodId, classId, subjectId, next);
      return next;
    });
  };

  const discard = () => {
    deleteGradeDraft(userId, periodId, classId, subjectId);
    setDraft(marks);
    setFoundCopy(false);
    setFailed(false);
  };

  const save = () =>
    startSaving(async () => {
      try {
        const result = await saveGrades(classId, subjectId, periodId, cells);
        if (!result.ok) {
          setFailed(true);
          toast.error(errorText(result.error));
          // Locked meanwhile: the page reloads read-only, the copy stays on the phone.
          if (result.error === "periodLocked") router.refresh();
          return;
        }
        deleteGradeDraft(userId, periodId, classId, subjectId);
        setFoundCopy(false);
        toast.success(t("saved", { count: cells.length }));
        router.refresh();
      } catch {
        // No answer (slow or dropped connection): every mark stays, on screen and on the phone.
        setFailed(true);
        toast.error(tErrors("network"));
      }
    });

  const absentLabel = t("absentShort");
  const cell = (studentId: string, column: SheetColumn): CellView => {
    const key = markKey(studentId, column.kind, column.number);
    const text = (canEdit ? draft[key] : marks[key]) ?? "";
    const mark = parseMark(text, scale);
    return {
      text: mark.kind === "absent" ? absentLabel : text,
      changed: !sameMark(mark, parseMark(marks[key] ?? "", scale)),
      invalid: mark.kind === "invalid",
      absent: mark.kind === "absent",
    };
  };
  const columnLabel = (c: SheetColumn, short: boolean) =>
    c.kind === "activities" ? t(short ? "activitiesShort" : "activities") : t(short ? "controlShort" : "control", { number: c.number });
  // Saved marks only (like the average): a typed but unsaved mark changes nothing until saved.
  const average = averages && ((studentId: string): SheetAverage => {
    const v = averages[studentId];
    const entered = columns.filter((c) => (marks[markKey(studentId, c.kind, c.number)] ?? "") !== "").length;
    return {
      value: v === null || v === undefined ? null : formatAverage(v),
      count: partlyEntered(entered, expectedMarks) ? t("count", { entered, expected: expectedMarks }) : null,
    };
  });
  const view = { students, columns, canEdit, cell, setCell, columnLabel, average };

  return (
    <div className="flex flex-col gap-3">
      {copyState === "restored" && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm" data-draft-restored>
          <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex-1">{t("restored")}</span>
          <Button variant="ghost" size="sm" onClick={discard}>{t("discard")}</Button>
        </p>
      )}
      {copyState === "locked" && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm" data-draft-locked>
          <CircleAlert className="size-4 shrink-0 text-warning" aria-hidden />
          <span className="flex-1">{t("lockedCopy")}</span>
          <Button variant="ghost" size="sm" onClick={discard}>{t("discard")}</Button>
        </p>
      )}

      {students.length === 0 ? (
        <p className="text-muted-foreground">{t("noStudents")}</p>
      ) : (
        <>
          <div className="md:hidden">
            <PhoneSheet {...view} />
          </div>
          <div className="hidden md:block">
            <GridSheet {...view} />
          </div>
        </>
      )}

      {average && dirty && <p className="text-xs text-muted-foreground">{t("averageAfterSave")}</p>}

      {canEdit && dirty && (
        <div data-grade-savebar className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-md">
          <div className="flex flex-col text-sm" aria-live="polite">
            <span className="font-medium">{t("pending", { count: cells.length + invalid.size })}</span>
            {invalid.size > 0 && <span className="text-destructive">{t("invalid", { count: invalid.size, scale })}</span>}
            {failed && invalid.size === 0 && <span className="text-destructive">{t("notSaved")}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={discard} disabled={isSaving}>{t("cancel")}</Button>
            <Button onClick={save} disabled={isSaving || invalid.size > 0 || cells.length === 0}>
              {isSaving ? t("saving") : failed ? t("retry") : t("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
