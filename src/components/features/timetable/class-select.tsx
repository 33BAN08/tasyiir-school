"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { TimetableOption } from "@/lib/timetable/types";

type Props = { yearId: string; classes: TimetableOption[]; value: string };

/** The class whose week is shown, kept in `?class=` (with the year). */
export function ClassSelect({ yearId, classes, value }: Props) {
  const t = useTranslations("timetable");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="class-select" className="text-sm font-medium">
        {t("class")}
      </label>
      <Select
        value={value}
        disabled={isPending}
        onValueChange={(id) => startTransition(() => router.replace(`${pathname}?year=${yearId}&class=${id}`))}
      >
        <SelectTrigger id="class-select" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <bdi>{c.name}</bdi>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
