"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { TimetableOption } from "@/lib/timetable/types";
import { TIMETABLE_VIEWS, type TimetableViewKind } from "@/lib/timetable/views";
import { cn } from "@/lib/utils";

/** Whose week is shown: a class, a teacher or a room (`?view=`, the year is kept). */
export function ViewTabs({ yearId, value }: { yearId: string; value: TimetableViewKind }) {
  const t = useTranslations("timetable.views");
  return (
    <nav aria-label={t("label")} className="inline-flex rounded-lg bg-muted p-1">
      {TIMETABLE_VIEWS.map((view) => (
        <Link
          key={view}
          href={{ pathname: "/timetable", query: { year: yearId, view } }}
          aria-current={view === value ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
            view === value && "bg-background text-foreground shadow-sm",
          )}
        >
          {t(view)}
        </Link>
      ))}
    </nav>
  );
}

type SelectProps = { yearId: string; view: TimetableViewKind; options: TimetableOption[]; value: string };

/** The class, teacher or room whose week is shown, kept in `?class=` / `?teacher=` / `?room=`. */
export function TimetableSelect({ yearId, view, options, value }: SelectProps) {
  const t = useTranslations("timetable.views");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const id = `timetable-${view}`;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {t(`${view}Label`)}
      </label>
      <Select
        value={value}
        disabled={isPending}
        onValueChange={(next) =>
          startTransition(() => router.replace(`${pathname}?year=${yearId}&view=${view}&${view}=${next}`))
        }
      >
        <SelectTrigger id={id} className={view === "class" ? "w-40" : "w-56"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              <bdi>{o.name}</bdi>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
