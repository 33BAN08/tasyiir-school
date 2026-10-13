"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";

type Props = { years: { id: string; label: string; isCurrent: boolean }[]; value: string };

/** Academic year shown on the page, kept in `?year=` (the current year when absent). */
export function YearSelect({ years, value }: Props) {
  const t = useTranslations("setup.classes");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="year-select" className="text-sm font-medium">
        {t("year")}
      </label>
      <Select
        value={value}
        disabled={isPending}
        onValueChange={(id) => startTransition(() => router.replace(`${pathname}?year=${id}`))}
      >
        <SelectTrigger id="year-select" className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y.id} value={y.id}>
              {y.isCurrent ? t("currentYear", { label: y.label }) : y.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
