"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { shortMonth } from "@/lib/fees/months";
import { addStudentService, updateStudentService } from "@/lib/fees/student-actions";

import { useFeesError } from "./use-fees-error";

/** Select value for "until the end of the year" (Radix Select refuses ""). */
const END = "end";

type Props = {
  studentId: string;
  yearId: string;
  /** Change the months of this period; add a new one when absent. */
  periodId?: string;
  /** Services the student can get (active ones; the period's own service when editing). */
  services: { id: string; label: string }[];
  /** The year's billed months (the choices for "from" / "until"). */
  months: string[];
  defaults: { serviceId: string; fromMonth: string; toMonth: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactNode;
};

/** A service for a student, from one billed month to another (or to the end of the year). */
export function StudentServiceDialog(props: Props) {
  const { studentId, yearId, periodId, services, defaults, open, onOpenChange, trigger } = props;
  const t = useTranslations("fees.student.services.form");
  const locale = useLocale();
  const translateError = useFeesError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serviceId, setServiceId] = useState(defaults.serviceId);
  const [fromMonth, setFromMonth] = useState(defaults.fromMonth);
  const [toMonth, setToMonth] = useState(defaults.toMonth ?? END);
  const [error, setError] = useState<{ field?: string; key: string } | null>(null);
  // A period saved before the months changed keeps its own months selectable.
  const months = [...new Set([...props.months, defaults.fromMonth, ...(defaults.toMonth ? [defaults.toMonth] : [])])]
    .filter(Boolean)
    .sort();

  function reset(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setServiceId(defaults.serviceId);
      setFromMonth(defaults.fromMonth);
      setToMonth(defaults.toMonth ?? END);
      setError(null);
    }
  }

  function save() {
    const values = { serviceId, fromMonth, toMonth: toMonth === END ? "" : toMonth };
    startTransition(async () => {
      const result = periodId
        ? await updateStudentService(periodId, values)
        : await addStudentService(studentId, yearId, values);
      if (!result.ok) {
        setError({ field: result.field, key: result.error });
        if (!result.field) toast.error(translateError(result.error));
        return;
      }
      toast.success(t(periodId ? "updated" : "added"));
      reset(false);
      router.refresh();
    });
  }

  const monthSelect = (id: string, value: string, onChange: (v: string) => void, withEnd: boolean) => (
    <Select
      value={value}
      onValueChange={(v) => {
        setError(null);
        onChange(v);
      }}
      disabled={isPending}
    >
      <SelectTrigger id={id} className="min-h-11 w-full" aria-invalid={error?.field === (withEnd ? "toMonth" : "fromMonth")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {months.map((m) => (
          <SelectItem key={m} value={m}>
            <span className="font-numeric">{shortMonth(m, locale)}</span>
          </SelectItem>
        ))}
        {withEnd && <SelectItem value={END}>{t("untilEnd")}</SelectItem>}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={reset}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(periodId ? "editTitle" : "addTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          <Field>
            <FieldLabel htmlFor="student-service">{t("service")}</FieldLabel>
            <Select value={serviceId} onValueChange={setServiceId} disabled={isPending || !!periodId}>
              <SelectTrigger id="student-service" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid gap-6 sm:grid-cols-2">
            <Field data-invalid={error?.field === "fromMonth"}>
              <FieldLabel htmlFor="student-service-from">{t("from")}</FieldLabel>
              {monthSelect("student-service-from", fromMonth, setFromMonth, false)}
              {error?.field === "fromMonth" && <FieldError>{translateError(error.key)}</FieldError>}
            </Field>
            <Field data-invalid={error?.field === "toMonth"}>
              <FieldLabel htmlFor="student-service-to">{t("to")}</FieldLabel>
              {monthSelect("student-service-to", toMonth, setToMonth, true)}
              {error?.field === "toMonth" && <FieldError>{translateError(error.key)}</FieldError>}
            </Field>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" className="min-h-11" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button className="min-h-11" onClick={save} disabled={isPending || !serviceId || !fromMonth}>
            {isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
