"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { ltr } from "@/lib/format";
import { SUBJECT_SWATCH, type SubjectColor } from "@/lib/structure/subject-template";
import { cn } from "@/lib/utils";

type Option = { id: string; label: string; color?: SubjectColor };

function Picker({ id, label, value, options, onChange, disabled, width = "w-56" }: {
  id: string;
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled: boolean;
  width?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <label htmlFor={id} className="shrink-0 text-sm font-medium">{label}</label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className={cn("max-w-full", width)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.color && <span className={cn("size-2.5 shrink-0 rounded-full", SUBJECT_SWATCH[o.color])} aria-hidden />}
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** A teacher: one list of their own class + subject pairs ("1AC-A · Mathématiques"). */
export function TeacherPairPicker({ pairs, value, periodId }: {
  pairs: { classId: string; subjectId: string; label: string; color: SubjectColor }[];
  value: string;
  periodId: string;
}) {
  const t = useTranslations("grades.pickers");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Picker
      id="grades-pair"
      label={t("pair")}
      value={value}
      width="w-72"
      disabled={isPending}
      options={pairs.map((p) => ({ id: `${p.classId}:${p.subjectId}`, label: p.label, color: p.color }))}
      onChange={(v) => {
        const [classId, subjectId] = v.split(":");
        startTransition(() => router.replace(`/grades?class=${classId}&subject=${subjectId}&period=${periodId}`));
      }}
    />
  );
}

/** Staff (grades.manage / grades.view): year, class, subject (the averages page: no subject). */
export function StaffSheetPickers({ years, yearId, classes, classId, subjects, subjectId, periodId, basePath = "/grades" }: {
  years: { id: string; label: string; isCurrent: boolean }[];
  yearId: string;
  classes: Option[];
  classId: string;
  subjects: Option[];
  subjectId: string;
  periodId: string;
  basePath?: string;
}) {
  const t = useTranslations("grades.pickers");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const go = (query: string) => startTransition(() => router.replace(`${basePath}?${query}`));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Picker
        id="grades-year"
        label={t("year")}
        value={yearId}
        width="w-44"
        disabled={isPending}
        options={years.map((y) => ({ id: y.id, label: y.isCurrent ? t("currentYear", { label: ltr(y.label) }) : y.label }))}
        onChange={(v) => go(`year=${v}`)}
      />
      {classes.length > 0 && (
        <Picker id="grades-class" label={t("class")} value={classId} width="w-40" disabled={isPending} options={classes}
          onChange={(v) => go(`year=${yearId}&class=${v}&subject=${subjectId}`)} />
      )}
      {subjects.length > 0 && (
        <Picker id="grades-subject" label={t("subject")} value={subjectId} width="w-56" disabled={isPending} options={subjects}
          onChange={(v) => go(`year=${yearId}&class=${classId}&subject=${v}&period=${periodId}`)} />
      )}
    </div>
  );
}
