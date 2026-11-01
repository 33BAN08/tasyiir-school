"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";

const ALL = "all";

type Props = {
  yearId: string;
  classes: { id: string; name: string }[];
  /** Billed months: value "yyyy-MM", label in the UI language. */
  months: { value: string; label: string }[];
  classId: string | null;
  /** "yyyy-MM", "registration" or null. */
  month: string | null;
};

/** Class + month of the unpaid list, kept in the URL (`?year=&class=&month=`). */
export function UnpaidFilters({ yearId, classes, months, classId, month }: Props) {
  const t = useTranslations("fees.unpaid");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const go = (next: { class: string | null; month: string | null }) => {
    const q = new URLSearchParams({ year: yearId });
    if (next.class) q.set("class", next.class);
    if (next.month) q.set("month", next.month);
    startTransition(() => router.replace(`${pathname}?${q}`));
  };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-unpaid-filters>
      <div className="flex items-center gap-2">
        <label htmlFor="unpaid-class" className="text-sm font-medium">{t("class")}</label>
        <Select value={classId ?? ALL} disabled={isPending} onValueChange={(v) => go({ class: v === ALL ? null : v, month })}>
          <SelectTrigger id="unpaid-class" className="min-h-11 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allClasses")}</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span dir="auto">{c.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="unpaid-month" className="text-sm font-medium">{t("month")}</label>
        <Select value={month ?? ALL} disabled={isPending} onValueChange={(v) => go({ class: classId, month: v === ALL ? null : v })}>
          <SelectTrigger id="unpaid-month" className="min-h-11 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("allMonths")}</SelectItem>
            <SelectItem value="registration">{t("registration")}</SelectItem>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
