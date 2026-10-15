"use client";

import { CalendarClock, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { ltr } from "@/lib/format";
import { applyTimeSlotTemplate, copyTimeSlotsFromYear } from "@/lib/structure/time-slot-actions";

import { useSetupError } from "./use-setup-error";

type SourceYear = { id: string; label: string; slots: number };

type Props = {
  yearId: string;
  yearLabel: string;
  /** Other years of the school that have slots. */
  sources: SourceYear[];
};

/** Ways to fill an empty year: copy another year's slots, or the typical Moroccan week. */
export function TimeSlotYearActions({ yearId, yearLabel, sources }: Props) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {sources.length > 0 && <CopyYearDialog yearId={yearId} yearLabel={yearLabel} sources={sources} />}
      <TemplateDialog yearId={yearId} yearLabel={yearLabel} primary={sources.length === 0} />
    </div>
  );
}

function useRun() {
  const translateError = useSetupError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok: true; data: { created: number } } | { ok: false; error: string }>,
    done: (created: number) => void) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      done(result.data.created);
      router.refresh();
    });
  return { isPending, run };
}

function CopyYearDialog({ yearId, yearLabel, sources }: Props) {
  const t = useTranslations("setup.timeSlots.copyYear");
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(sources[0]?.id ?? "");
  const { isPending, run } = useRun();

  function copy() {
    run(
      () => copyTimeSlotsFromYear(from, yearId),
      (created) => {
        toast.success(t("done", { count: created }));
        setOpen(false);
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <CalendarClock aria-hidden />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { year: ltr(yearLabel) })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="copy-year-from">{t("from")}</FieldLabel>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger id="copy-year-from" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sources.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {t("source", { year: ltr(y.label), count: y.slots })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button disabled={isPending || !from} onClick={copy}>
            {isPending ? t("copying") : t("copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TemplateDialog({ yearId, yearLabel, primary }: { yearId: string; yearLabel: string; primary: boolean }) {
  const t = useTranslations("setup.timeSlots.template");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const { isPending, run } = useRun();

  function apply() {
    run(
      () => applyTimeSlotTemplate(yearId, locale),
      (created) => {
        toast.success(t("done", { count: created }));
        setOpen(false);
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={primary ? "default" : "outline"}>
          <Sparkles aria-hidden />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { year: ltr(yearLabel) })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <ul className="flex list-disc flex-col gap-1 ps-5 text-sm">
          <li>{t("weekdays")}</li>
          <li>{t("saturday")}</li>
          <li>{t("editable")}</li>
        </ul>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button disabled={isPending} onClick={apply}>
            {isPending ? t("applying") : t("apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
