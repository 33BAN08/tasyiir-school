"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { arMA, enUS, fr } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ltr } from "@/lib/format";

const LOCALES = { ar: arMA, fr, en: enUS } as const;

/** "yyyy-MM-dd" ± n days, calendar arithmetic only. */
function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
const toDate = (value: string) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

type Props = {
  /** The day shown ("yyyy-MM-dd"). */
  date: string;
  /** The school's today: no later day can be chosen. */
  today: string;
  /** Other query parameters to keep, e.g. "class=…". */
  keep?: string;
};

/** The day shown, kept in `?date=`: previous / next day, or a calendar (dd/MM/yyyy, week from Monday). */
export function DayNav({ date, today, keep }: Props) {
  const t = useTranslations("absences.day");
  const locale = useLocale() as keyof typeof LOCALES;
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const go = (next: string) =>
    startTransition(() => router.replace(`${pathname}?date=${next}${keep ? `&${keep}` : ""}`));
  const [y, m, d] = date.split("-");

  return (
    <div className="flex items-center gap-1" aria-busy={isPending}>
      <Button type="button" variant="outline" size="icon" aria-label={t("previous")} disabled={isPending} onClick={() => go(shift(date, -1))}>
        <ChevronLeft className="rtl:-scale-x-100" aria-hidden />
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="min-w-36 justify-start gap-2" aria-label={t("choose")}>
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            {date === today ? t("today") : ltr(`${d}/${m}/${y}`)}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={LOCALES[locale]}
            weekStartsOn={1}
            selected={toDate(date)}
            defaultMonth={toDate(date)}
            disabled={{ after: toDate(today) }}
            onSelect={(day) => {
              if (!day) return;
              setOpen(false);
              go(toIso(day));
            }}
          />
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t("next")}
        disabled={isPending || date >= today}
        onClick={() => go(shift(date, 1))}
      >
        <ChevronRight className="rtl:-scale-x-100" aria-hidden />
      </Button>
    </div>
  );
}
