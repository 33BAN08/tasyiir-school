"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { setSchoolDay } from "@/lib/structure/time-slot-actions";
import { DAY_KEYS, SCHOOL_DAYS, type SchoolDay } from "@/lib/structure/time-slot-template";

import { useSetupError } from "./use-setup-error";

type Props = { yearId: string; days: SchoolDay[] };

/** Monday → Saturday switches: which days the school works this year. */
export function SchoolDayToggles({ yearId, days }: Props) {
  const t = useTranslations("setup.timeSlots");
  const tDays = useTranslations("setup.timeSlots.days");
  const translateError = useSetupError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const on = new Set(days);

  function toggle(day: SchoolDay) {
    startTransition(async () => {
      const result = await setSchoolDay(yearId, day, !on.has(day));
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div role="group" aria-label={t("daysLabel")} className="flex flex-wrap gap-2">
      {SCHOOL_DAYS.map((day) => {
        const active = on.has(day);
        return (
          <Button
            key={day}
            variant={active ? "default" : "outline"}
            size="sm"
            aria-pressed={active}
            disabled={isPending}
            onClick={() => toggle(day)}
          >
            {active && <Check aria-hidden />}
            {tDays(DAY_KEYS[day])}
          </Button>
        );
      })}
    </div>
  );
}
