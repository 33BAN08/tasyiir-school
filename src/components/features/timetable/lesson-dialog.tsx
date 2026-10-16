"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/features/setup/confirm-dialog";
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
import { isolate, ltr } from "@/lib/format";
import { DAY_KEYS } from "@/lib/structure/time-slot-template";
import type { TimeSlot } from "@/lib/structure/time-slots";
import { createLesson, deleteLesson, updateLesson } from "@/lib/timetable/lesson-actions";
import type { TimetableLesson, TimetableOption, TimetableSubject, TimetableTeacher } from "@/lib/timetable/types";
import { useRouter } from "@/i18n/navigation";
import { lessonDetailsSchema, type LessonDetailsValues } from "@/lib/validations/timetable";

import { LessonFields } from "./lesson-fields";
import { useTimetableError } from "./use-timetable-error";

export type LessonChoices = {
  subjects: TimetableSubject[];
  teachers: TimetableTeacher[];
  rooms: TimetableOption[];
  /** Every lesson of the year (who is busy at which slot). */
  yearLessons: TimetableLesson[];
};

type Props = LessonChoices & {
  classId: string;
  className: string;
  slot: TimeSlot;
  /** Edit this lesson; add a new one in the slot when absent. */
  lesson?: TimetableLesson;
  onClose: () => void;
};

/** Add a lesson to an empty cell, or change / delete one. */
export function LessonDialog({ classId, className, slot, lesson, onClose, ...choices }: Props) {
  const t = useTranslations("timetable.dialog");
  const tDays = useTranslations("setup.timeSlots.days");
  const translateError = useTimetableError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const form = useForm<LessonDetailsValues>({
    resolver: zodResolver(lessonDetailsSchema),
    defaultValues: {
      subjectId: lesson?.subjectId ?? "",
      teacherId: lesson?.teacherId ?? "",
      roomId: lesson?.roomId ?? "",
    },
  });
  const where = t("where", {
    class: isolate(className),
    day: tDays(DAY_KEYS[slot.day]),
    range: ltr(`${slot.startTime}–${slot.endTime}`),
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = lesson
        ? await updateLesson(lesson.id, values)
        : await createLesson({ ...values, classId, timeSlotId: slot.id });
      if (!result.ok) {
        const message = translateError(result.error, result.conflict);
        if (result.field) form.setError(result.field, { message }, { shouldFocus: true });
        else toast.error(message);
        return;
      }
      const subject = choices.subjects.find((s) => s.id === values.subjectId)?.name ?? "";
      toast.success(lesson ? t("updated") : t("created", { subject: isolate(subject) }));
      onClose();
      router.refresh();
    });
  });

  const onDelete = () => {
    if (!lesson) return;
    startTransition(async () => {
      const result = await deleteLesson(lesson.id);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("deleted"));
      setConfirmDelete(false);
      onClose();
      router.refresh();
    });
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(lesson ? "editTitle" : "createTitle")}</DialogTitle>
            <DialogDescription>{where}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
            <LessonFields form={form} slotId={slot.id} lessonId={lesson?.id} {...choices} />
            <DialogFooter className="sm:justify-between">
              {lesson ? (
                <Button type="button" variant="ghost" className="text-destructive" disabled={isPending} onClick={() => setConfirmDelete(true)}>
                  <Trash2 aria-hidden />
                  {t("delete")}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isPending}>
                    {t("cancel")}
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isPending}>
                  {isPending ? t("saving") : t("save")}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {lesson && (
        <ConfirmDeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={t("deleteTitle", { subject: isolate(lesson.subjectName) })}
          description={t("deleteDescription", { where })}
          onConfirm={onDelete}
          pending={isPending}
        />
      )}
    </>
  );
}
