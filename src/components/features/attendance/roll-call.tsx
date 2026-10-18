"use client";

import { CircleAlert, CircleCheck, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { saveRollCall } from "@/lib/attendance/actions";
import { deleteDraft, purgeDrafts, readDraft, writeDraft, type RollCallDraft } from "@/lib/attendance/drafts";
import type { RollCallMark } from "@/lib/attendance/types";
import { ltr } from "@/lib/format";
import { cn } from "@/lib/utils";

import { StudentRow, type RollCallStudentView } from "./student-row";

type Props = {
  userId: string;
  lessonId: string;
  /** The school's today ("yyyy-MM-dd", from the database). */
  date: string;
  students: RollCallStudentView[];
  /** Today's saved marks (empty when attendance was not taken yet). */
  initialMarks: RollCallDraft;
  takenAt: string | null;
  updatedAt: string | null;
};

const NEXT: Record<"present" | "absent" | "late", RollCallMark | null> = {
  present: { status: "absent", minutesLate: null },
  absent: { status: "late", minutesLate: null },
  late: null,
};

/** Same marks? (Key order and minutes included.) */
function sameMarks(a: RollCallDraft, b: RollCallDraft): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((k) => b[k]?.status === a[k].status && (b[k]?.minutesLate ?? null) === (a[k].minutesLate ?? null))
  );
}

/**
 * The roll call: everyone present; one tap = absent, two = late (minutes
 * optional), three = present again. Taps are instant (only saving uses the
 * network) and kept on the phone until saved, so a reload or a dropped
 * connection loses nothing.
 */
export function RollCall({ userId, lessonId, date, students, initialMarks, takenAt: initialTaken, updatedAt: initialUpdated }: Props) {
  const t = useTranslations("attendance.rollCall");
  const tErrors = useTranslations("attendance.errors");
  const [marks, setMarks] = useState<RollCallDraft>(initialMarks);
  const [saved, setSaved] = useState<RollCallDraft>(initialMarks);
  const [takenAt, setTakenAt] = useState(initialTaken);
  const [updatedAt, setUpdatedAt] = useState(initialUpdated);
  const [failed, setFailed] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [isSaving, startSaving] = useTransition();
  const errorText = (key: string) => {
    const k = key as Parameters<typeof tErrors>[0];
    return tErrors.has(k) ? tErrors(k) : tErrors("generic");
  };

  // Once in the browser: old copies go, and an unsaved copy of this roll call comes back.
  useEffect(() => {
    purgeDrafts(userId, date);
    const draft = readDraft(userId, lessonId, date);
    if (draft && !sameMarks(draft, initialMarks)) {
      // Restoring browser-only state after hydration (the server cannot see it).
      setMarks(draft);
      setRestored(true);
    }
  }, [userId, lessonId, date, initialMarks]);

  const change = (next: RollCallDraft) => {
    setMarks(next);
    setFailed(null);
    if (sameMarks(next, saved)) deleteDraft(userId, lessonId, date);
    else writeDraft(userId, lessonId, date, next);
  };
  const tap = (studentId: string) => {
    const { [studentId]: current, ...rest } = marks;
    const next = NEXT[current?.status ?? "present"];
    change(next ? { ...rest, [studentId]: next } : rest);
  };
  const setMinutes = (studentId: string, minutesLate: number | null) =>
    change({ ...marks, [studentId]: { status: "late", minutesLate } });

  const save = () =>
    startSaving(async () => {
      const payload = Object.entries(marks).map(([studentId, m]) => ({ studentId, status: m.status, minutesLate: m.minutesLate }));
      try {
        const result = await saveRollCall(lessonId, payload);
        if (!result.ok) {
          setFailed(result.error);
          toast.error(errorText(result.error));
          return;
        }
        deleteDraft(userId, lessonId, date);
        setSaved(marks);
        setTakenAt(result.data.takenAt);
        setUpdatedAt(result.data.updatedAt);
        setRestored(false);
        toast.success(t("savedToast", { time: ltr(result.data.updatedAt ?? result.data.takenAt) }));
      } catch {
        // No answer (slow or dropped connection): the taps stay, on screen and on the phone.
        setFailed("network");
        toast.error(tErrors("network"));
      }
    });

  const absent = Object.values(marks).filter((m) => m.status === "absent").length;
  const late = Object.values(marks).filter((m) => m.status === "late").length;
  const dirty = !sameMarks(marks, saved) || !takenAt;

  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite" className="flex flex-col gap-2">
        {takenAt ? (
          <p className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm font-medium">
            <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
            <span>
              {t("takenAt", { time: ltr(takenAt) })}
              {updatedAt && <> · {t("updatedAt", { time: ltr(updatedAt) })}</>}
            </span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("notTaken")}</p>
        )}
        {restored && <p className="text-sm text-muted-foreground">{t("restored")}</p>}
      </div>

      {students.length === 0 ? (
        <p className="text-muted-foreground">{t("noStudents")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {students.map((student) => (
            <StudentRow
              key={student.id}
              student={student}
              mark={marks[student.id]}
              onTap={() => tap(student.id)}
              onMinutes={(minutes) => setMinutes(student.id, minutes)}
            />
          ))}
        </ul>
      )}

      {/* Always reachable with a thumb. */}
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:mx-0 md:rounded-lg md:border">
        <p aria-live="polite" className="text-center text-sm font-medium">
          {t("counts", { present: students.length - absent - late, absent, late })}
        </p>
        {failed && (
          <p className="flex items-center justify-center gap-1.5 text-sm text-danger">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {failed === "network" ? t("failedNetwork") : errorText(failed)}
          </p>
        )}
        <Button
          type="button"
          size="lg"
          className={cn("min-h-12 w-full text-base", !dirty && "opacity-80")}
          disabled={isSaving || students.length === 0}
          onClick={save}
        >
          {failed && !isSaving && <RotateCcw className="rtl:-scale-x-100" aria-hidden />}
          {isSaving ? t("saving") : failed ? t("retry") : takenAt && !dirty ? t("saveAgain") : t("save")}
        </Button>
      </div>
    </div>
  );
}
