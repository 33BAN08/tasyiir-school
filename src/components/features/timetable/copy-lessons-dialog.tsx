"use client";

import { Ban, Check, Copy, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { isolate, ltr } from "@/lib/format";
import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import { DAY_KEYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import { copyLessons, previewCopy, type CopyLine } from "@/lib/timetable/copy-actions";
import type { TimetableOption } from "@/lib/timetable/types";
import { cn } from "@/lib/utils";

/** An earlier year and its classes (most recent year first). */
export type CopySourceYear = { id: string; label: string; classes: TimetableOption[] };

type Props = {
  /** The empty class of the current year. */
  target: TimetableOption;
  yearLabel: string;
  sources: CopySourceYear[];
};

const isCopied = (line: CopyLine) => line.status === "copy" || line.status === "room_busy";

/** The class with the same name in that year ("1AC-A" → "1AC-A"), else its first class. */
function sameClass(year: CopySourceYear | undefined, name: string): string {
  const match = year?.classes.find((c) => c.name.localeCompare(name, undefined, { sensitivity: "base" }) === 0);
  return match?.id ?? year?.classes[0]?.id ?? "";
}

/** "Copy from another year" for an empty class: choose the class, see what will be copied or skipped and why, then copy. */
export function CopyLessonsDialog({ target, yearLabel, sources }: Props) {
  const t = useTranslations("timetable.copy");
  const tDays = useTranslations("setup.timeSlots.days");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [yearId, setYearId] = useState(sources[0]?.id ?? "");
  const [classId, setClassId] = useState("");
  const [lines, setLines] = useState<CopyLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();
  const [isCopying, startCopying] = useTransition();
  // Only the latest preview counts when the class is changed quickly.
  const request = useRef(0);

  const errorText = (key: string) => {
    const k = `errors.${key}` as Parameters<typeof t>[0];
    return t.has(k) ? t(k) : t("errors.generic");
  };

  const load = (fromClass: string) => {
    setClassId(fromClass);
    setLines(null);
    setError(null);
    if (!fromClass) return;
    const mine = ++request.current;
    startLoading(async () => {
      const result = await previewCopy(fromClass, target.id);
      if (mine !== request.current) return;
      if (result.ok) setLines(result.data);
      else setError(errorText(result.error));
    });
  };

  const onOpen = () => {
    setOpen(true);
    const year = sources.find((y) => y.id === yearId);
    load(sameClass(year, target.name));
  };

  const onCopy = () => {
    startCopying(async () => {
      const result = await copyLessons(classId, target.id);
      if (!result.ok) {
        toast.error(errorText(result.error));
        return;
      }
      const copied = result.data.filter(isCopied).length;
      toast.success(t("done", { copied, skipped: result.data.length - copied }));
      setOpen(false);
      router.refresh();
    });
  };

  const year = sources.find((y) => y.id === yearId);
  const copied = lines?.filter(isCopied).length ?? 0;
  const withoutRoom = lines?.filter((l) => l.status === "room_busy").length ?? 0;

  return (
    <>
      <Button type="button" variant="outline" onClick={onOpen}>
        <Copy aria-hidden />
        {t("open")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="pe-6">{t("title")}</DialogTitle>
            <DialogDescription>{t("description", { class: isolate(target.name), year: ltr(yearLabel) })}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="copy-year">{t("year")}</FieldLabel>
              <Select
                value={yearId}
                onValueChange={(value) => {
                  setYearId(value);
                  load(sameClass(sources.find((y) => y.id === value), target.name));
                }}
              >
                <SelectTrigger id="copy-year" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      <bdi>{y.label}</bdi>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="copy-class">{t("class")}</FieldLabel>
              <Select value={classId} onValueChange={load}>
                <SelectTrigger id="copy-class" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {year?.classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <bdi>{c.name}</bdi>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div aria-live="polite" className="flex min-h-24 flex-col gap-3">
            {isLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {lines && lines.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
            {lines && lines.length > 0 && (
              <>
                <div className="text-sm">
                  <p className="font-medium">{t("summary", { copied, skipped: lines.length - copied })}</p>
                  {withoutRoom > 0 && <p className="text-muted-foreground">{t("withoutRoom", { count: withoutRoom })}</p>}
                </div>
                <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                  {lines.map((line) => (
                    <CopyLineItem
                      key={line.lessonId}
                      line={line}
                      when={t("slot", { day: tDays(DAY_KEYS[line.day as SchoolDay]), range: ltr(`${line.start}–${line.end}`) })}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isCopying}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="button" onClick={onCopy} disabled={!lines || copied === 0 || isLoading || isCopying}>
              {isCopying ? t("copying") : t("submit", { count: copied })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One source lesson: when, subject, teacher, and what the copy does with it. */
function CopyLineItem({ line, when }: { line: CopyLine; when: string }) {
  const t = useTranslations("timetable.copy.status");
  const skipped = !isCopied(line);
  const Icon = line.status === "copy" ? Check : line.status === "room_busy" ? TriangleAlert : Ban;
  return (
    <li className={cn("flex gap-2 rounded px-2 py-1.5 text-sm", skipped && "bg-muted/60")}>
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          line.status === "copy" ? "text-success" : line.status === "room_busy" ? "text-warning" : "text-muted-foreground",
        )}
        aria-hidden
      />
      <div className="flex min-w-0 flex-col">
        <span className={cn("flex flex-wrap items-center gap-x-2", skipped && "text-muted-foreground")}>
          <span className="text-xs tabular-nums">{when}</span>
          <span className="flex items-center gap-1.5 font-medium">
            <span className={cn("size-2.5 shrink-0 rounded-full", SUBJECT_SWATCH[line.subjectColor])} aria-hidden />
            <bdi>{line.subjectName}</bdi>
          </span>
          <bdi className="text-xs text-muted-foreground">{line.teacherName}</bdi>
        </span>
        <span className={cn("text-xs", skipped ? "text-destructive" : line.status === "room_busy" ? "text-warning" : "text-muted-foreground")}>
          {t(line.status, { teacher: isolate(line.teacherName), room: isolate(line.roomName ?? "") })}
        </span>
      </div>
    </li>
  );
}
