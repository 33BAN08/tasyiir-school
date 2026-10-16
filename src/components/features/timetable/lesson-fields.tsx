"use client";

import { useTranslations } from "next-intl";
import { Controller, type UseFormReturn } from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isolate } from "@/lib/format";
import { SUBJECT_SWATCH } from "@/lib/structure/subject-template";
import { cn } from "@/lib/utils";
import type { LessonDetailsValues } from "@/lib/validations/timetable";

import type { LessonChoices } from "./lesson-dialog";

const NO_ROOM = "none"; // a Select item cannot have the value ""

type Props = LessonChoices & {
  form: UseFormReturn<LessonDetailsValues>;
  slotId: string;
  /** The lesson being edited (its own booking is not "busy"). */
  lessonId?: string;
};

/** Subject, then only the teachers who teach it, then an optional room. Busy ones are marked. */
export function LessonFields({ form, slotId, lessonId, subjects, teachers, rooms, yearLessons }: Props) {
  const t = useTranslations("timetable.dialog");
  const tErrors = useTranslations("timetable.errors");
  const subjectId = form.watch("subjectId");

  // Who already has a lesson at this slot, and with which class.
  const atSlot = yearLessons.filter((l) => l.slotId === slotId && l.id !== lessonId);
  const teacherBusy = new Map(atSlot.map((l) => [l.teacherId, l.className]));
  const roomBusy = new Map(atSlot.flatMap((l) => (l.roomId ? [[l.roomId, l.className] as const] : [])));
  const forSubject = teachers.filter((teacher) => teacher.subjectIds.includes(subjectId));

  // A refusal from the server is already a sentence; zod errors are keys.
  const message = (name: keyof LessonDetailsValues) => {
    const error = form.formState.errors[name]?.message;
    if (!error) return null;
    const key = error as Parameters<typeof tErrors>[0];
    return <FieldError>{tErrors.has(key) ? tErrors(key) : error}</FieldError>;
  };
  const busyNote = (className: string | undefined) =>
    className && <span className="text-xs text-warning">{t("busyWith", { class: isolate(className) })}</span>;

  return (
    <>
      <Controller
        control={form.control}
        name="subjectId"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="lesson-subject">{t("subject")}</FieldLabel>
            <Select
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
                form.clearErrors();
                // Keep the teacher if they teach the new subject; pick the only one otherwise.
                const able = teachers.filter((teacher) => teacher.subjectIds.includes(value));
                const current = form.getValues("teacherId");
                if (!able.some((teacher) => teacher.id === current)) {
                  form.setValue("teacherId", able.length === 1 ? able[0].id : "");
                }
              }}
            >
              <SelectTrigger id="lesson-subject" className="w-full" aria-invalid={fieldState.invalid}>
                <SelectValue placeholder={t("subjectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span className={cn("size-2.5 shrink-0 rounded-full", SUBJECT_SWATCH[s.color])} aria-hidden />
                    <bdi>{s.name}</bdi>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {message("subjectId")}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="teacherId"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="lesson-teacher">{t("teacher")}</FieldLabel>
            <Select
              value={field.value}
              disabled={!subjectId || forSubject.length === 0}
              onValueChange={(value) => {
                field.onChange(value);
                form.clearErrors("teacherId");
              }}
            >
              <SelectTrigger id="lesson-teacher" className="w-full" aria-invalid={fieldState.invalid}>
                <SelectValue placeholder={t(subjectId ? "teacherPlaceholder" : "chooseSubjectFirst")} />
              </SelectTrigger>
              <SelectContent>
                {forSubject.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id}>
                    <bdi>{teacher.name}</bdi>
                    {!teacher.active && <span className="text-xs text-muted-foreground">{t("inactive")}</span>}
                    {busyNote(teacherBusy.get(teacher.id))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {subjectId && forSubject.length === 0 && <FieldDescription>{t("noTeacherForSubject")}</FieldDescription>}
            {message("teacherId")}
          </Field>
        )}
      />
      <Controller
        control={form.control}
        name="roomId"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <FieldLabel htmlFor="lesson-room">
              {t("room")}
              <span className="font-normal text-muted-foreground">({t("optional")})</span>
            </FieldLabel>
            <Select
              value={field.value || NO_ROOM}
              onValueChange={(value) => {
                field.onChange(value === NO_ROOM ? "" : value);
                form.clearErrors("roomId");
              }}
            >
              <SelectTrigger id="lesson-room" className="w-full" aria-invalid={fieldState.invalid}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROOM}>{t("noRoom")}</SelectItem>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    <bdi>{room.name}</bdi>
                    {busyNote(roomBusy.get(room.id))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {message("roomId")}
          </Field>
        )}
      />
    </>
  );
}
