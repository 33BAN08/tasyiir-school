"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useTransition, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormDateField } from "@/components/features/forms/form-date-field";
import { FormTextField } from "@/components/features/forms/form-text-field";
import { Button } from "@/components/ui/button";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { ltr } from "@/lib/format";
import { createStudent, updateStudent } from "@/lib/students/student-actions";
import { GENDERS, studentSchema, type StudentFormValues } from "@/lib/validations/students";

import { StudentPhotoField } from "./student-photo-field";
import { useStudentsError } from "./use-students-error";

/** A Select item cannot have "" as its value. */
const NO_CLASS_ITEM = "__none";

export type ClassOption = { id: string; name: string };

type Props = {
  /** Edit this student; create a new one when absent. */
  studentId?: string;
  defaults: StudentFormValues;
  /** Classes of the current year; null when the school has no current year. */
  classes: ClassOption[] | null;
  yearLabel: string | null;
  /** Edit only: the student's photo (changed right away, not with the form). */
  photo?: { schoolId: string; name: string; initials: string; url: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
};

export const EMPTY_STUDENT: StudentFormValues = {
  lastName: "",
  firstName: "",
  lastNameAr: "",
  firstNameAr: "",
  birthDate: "",
  gender: "" as StudentFormValues["gender"],
  codeMassar: "",
  classId: "",
};

/** Create or edit a student: names (Latin, optional Arabic), birth date, gender, Massar code, class this year. */
export function StudentDialog({ studentId, defaults, classes, yearLabel, photo, open, onOpenChange, trigger }: Props) {
  const t = useTranslations("students.form");
  const translateError = useStudentsError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<StudentFormValues>({ resolver: zodResolver(studentSchema), defaultValues: defaults });
  const genderError = form.formState.errors.gender?.message;
  const classError = form.formState.errors.classId?.message;
  const thisYear = new Date().getFullYear();

  const onSubmit = form.handleSubmit(() => {
    const values = form.getValues(); // raw values: the action validates again
    startTransition(async () => {
      const result = studentId ? await updateStudent(studentId, values) : await createStudent(values);
      if (!result.ok) {
        if (result.field) form.setError(result.field, { message: result.error }, { shouldFocus: true });
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t(studentId ? "updated" : "created"));
      onOpenChange(false);
      if (!studentId) form.reset(EMPTY_STUDENT);
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) form.reset(defaults);
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t(studentId ? "editTitle" : "createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {studentId && photo && (
          <StudentPhotoField
            schoolId={photo.schoolId}
            studentId={studentId}
            name={photo.name}
            initials={photo.initials}
            photoUrl={photo.url}
          />
        )}
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <FormTextField
              form={form}
              name="lastName"
              label={t("lastName")}
              dir="ltr"
              autoComplete="off"
              maxLength={60}
              translateError={translateError}
            />
            <FormTextField
              form={form}
              name="firstName"
              label={t("firstName")}
              dir="ltr"
              autoComplete="off"
              maxLength={60}
              translateError={translateError}
            />
            <FormTextField
              form={form}
              name="lastNameAr"
              label={t("lastNameAr")}
              optional
              dir="rtl"
              lang="ar"
              autoComplete="off"
              maxLength={60}
              translateError={translateError}
            />
            <FormTextField
              form={form}
              name="firstNameAr"
              label={t("firstNameAr")}
              optional
              dir="rtl"
              lang="ar"
              autoComplete="off"
              maxLength={60}
              translateError={translateError}
            />
            <FormDateField
              form={form}
              name="birthDate"
              label={t("birthDate")}
              fromYear={thisYear - 30}
              toYear={thisYear}
              translateError={translateError}
            />
            <Controller
              control={form.control}
              name="gender"
              render={({ field }) => (
                <Field data-invalid={!!genderError}>
                  <FieldLabel htmlFor="field-gender">{t("gender")}</FieldLabel>
                  <Select value={field.value || undefined} onValueChange={field.onChange}>
                    <SelectTrigger id="field-gender" className="w-full" aria-invalid={!!genderError}>
                      <SelectValue placeholder={t("genderPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDERS.map((g) => (
                        <SelectItem key={g} value={g}>
                          {t(`genders.${g}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {genderError && <FieldError>{translateError(genderError)}</FieldError>}
                </Field>
              )}
            />
            <FormTextField
              form={form}
              name="codeMassar"
              label={t("codeMassar")}
              description={t("codeMassarHint")}
              optional
              dir="ltr"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={14}
              className="font-numeric uppercase tabular-nums"
              translateError={translateError}
            />
            <Controller
              control={form.control}
              name="classId"
              render={({ field }) => (
                <Field data-invalid={!!classError}>
                  <FieldLabel htmlFor="field-class">
                    {yearLabel ? t("classIn", { year: ltr(yearLabel) }) : t("class")}
                  </FieldLabel>
                  <Select
                    value={field.value || NO_CLASS_ITEM}
                    onValueChange={(v) => field.onChange(v === NO_CLASS_ITEM ? "" : v)}
                    disabled={!classes}
                  >
                    <SelectTrigger id="field-class" className="w-full" aria-invalid={!!classError}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_CLASS_ITEM}>{t("noClass")}</SelectItem>
                      {classes?.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <bdi>{c.name}</bdi>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!classes && <FieldDescription>{t("noCurrentYear")}</FieldDescription>}
                  {classError && <FieldError>{translateError(classError)}</FieldError>}
                </Field>
              )}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
