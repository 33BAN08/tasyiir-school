"use client";

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
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { copyDaySlots } from "@/lib/structure/time-slot-actions";
import { DAY_KEYS, SCHOOL_DAYS, type SchoolDay } from "@/lib/structure/time-slot-template";
import { cn } from "@/lib/utils";

import { useSetupError } from "./use-setup-error";

type Props = {
  yearId: string;
  day: SchoolDay;
  /** Days that already have slots: they cannot receive a copy. */
  filledDays: SchoolDay[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** "Copy to other days": the day's slots go to every ticked empty day (made a school day). */
export function CopyDayDialog({ yearId, day, filledDays, open, onOpenChange }: Props) {
  const t = useTranslations("setup.timeSlots.copyDay");
  const tDays = useTranslations("setup.timeSlots.days");
  const translateError = useSetupError();
  const router = useRouter();
  const [picked, setPicked] = useState<SchoolDay[]>([]);
  const [isPending, startTransition] = useTransition();
  const filled = new Set(filledDays);

  function toggle(target: SchoolDay, on: boolean) {
    setPicked((current) => (on ? [...current, target] : current.filter((d) => d !== target)));
  }

  function copy() {
    startTransition(async () => {
      const result = await copyDaySlots(yearId, day, picked);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("done", { count: result.data.created }));
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (next) setPicked([]);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { day: tDays(DAY_KEYS[day]) })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-3">
          {SCHOOL_DAYS.filter((d) => d !== day).map((target) => {
            const id = `copy-day-${target}`;
            const disabled = filled.has(target);
            return (
              <li key={target} className="flex items-center gap-3">
                <Checkbox
                  id={id}
                  checked={picked.includes(target)}
                  disabled={disabled || isPending}
                  onCheckedChange={(on) => toggle(target, on === true)}
                />
                <label htmlFor={id} className={cn("flex-1 text-sm font-medium", disabled && "opacity-60")}>
                  {tDays(DAY_KEYS[target])}
                </label>
                {disabled && <span className="text-sm text-muted-foreground">{t("hasSlots")}</span>}
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button disabled={isPending || picked.length === 0} onClick={copy}>
            {isPending ? t("copying") : t("copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
