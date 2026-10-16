"use client";

import { BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import type { Subject } from "@/lib/structure/subjects";
import { setTeacherSubjects } from "@/lib/teachers/teacher-actions";
import { cn } from "@/lib/utils";

import { useTeachersError } from "./use-teachers-error";

type Props = {
  teacherId: string;
  teacherName: string;
  /** Every subject of the school, by name. */
  subjects: Subject[];
  /** The subjects the teacher teaches now. */
  selectedIds: string[];
};

/** Tick the subjects this teacher teaches; saved as a whole. */
export function TeacherSubjectsDialog({ teacherId, teacherName, subjects, selectedIds }: Props) {
  const t = useTranslations("teachers.subjects");
  const translateError = useTeachersError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set(selectedIds));
  const [isPending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) setChosen(new Set(selectedIds)); // start from what is saved
  }

  function toggle(id: string, on: boolean) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const result = await setTeacherSubjects(teacherId, [...chosen]);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("saved"));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t("buttonFor", { name: teacherName })}>
          <BookOpen aria-hidden />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("title", { name: teacherName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1 sm:grid-cols-2">
          {subjects.map((subject) => {
            const inputId = `subject-${subject.id}`;
            return (
              <li key={subject.id}>
                <label
                  htmlFor={inputId}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                >
                  <Checkbox
                    id={inputId}
                    checked={chosen.has(subject.id)}
                    onCheckedChange={(v) => toggle(subject.id, v === true)}
                  />
                  <span className={cn("size-3 shrink-0 rounded-full", SUBJECT_SWATCH[subject.color])} aria-hidden />
                  {/* The name keeps its own direction but starts next to its checkbox; long names wrap
                      (an ellipsis would cut the start of a Latin name in the Arabic UI). */}
                  <span className="min-w-0 flex-1 text-start text-sm break-words">
                    <bdi>{subject.name}</bdi>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted-foreground">{t("count", { count: chosen.size })}</p>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button type="button" onClick={save} disabled={isPending}>
            {isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
