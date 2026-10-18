"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";

type Props = {
  classes: { id: string; name: string }[];
  value: string;
  /** Other query parameters to keep, e.g. "date=…". */
  keep?: string;
};

/** The class shown, kept in `?class=`. */
export function ClassSelect({ classes, value, keep }: Props) {
  const t = useTranslations("absences");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="absences-class" className="text-sm font-medium">
        {t("class")}
      </label>
      <Select
        value={value}
        disabled={isPending}
        onValueChange={(id) => startTransition(() => router.replace(`${pathname}?class=${id}${keep ? `&${keep}` : ""}`))}
      >
        <SelectTrigger id="absences-class" className="w-40">
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
