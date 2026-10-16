"use client";

import { Loader2, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";

const ALL = "all";
const SEARCH_DELAY_MS = 300;

export type ListFilterSelect = {
  /** URL query key, e.g. "status". */
  param: string;
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
};

type Props = {
  searchLabel: string;
  searchPlaceholder: string;
  loadingLabel: string;
  selects: ListFilterSelect[];
};

/** The URL value if it is one of the options; anything else is ignored by the server too → "all". */
function selectedValue(select: ListFilterSelect, value: string | null): string {
  return select.options.some((option) => option.value === value) ? value! : ALL;
}

/** Search box + select filters, kept in the URL (?q=&<param>=) so lists are shareable. */
export function ListFilters({ searchLabel, searchPlaceholder, loadingLabel, selects }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function update(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page"); // new filter → back to the first page
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
  }

  function onSearchChange(value: string) {
    setQ(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update("q", value.trim() || undefined), SEARCH_DELAY_MS);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:max-w-xs sm:flex-1">
        <Search
          className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          className="ps-8 [unicode-bidi:plaintext]"
        />
      </div>
      {selects.map((select) => (
        <Select
          key={select.param}
          value={selectedValue(select, searchParams.get(select.param))}
          onValueChange={(value) => update(select.param, value === ALL ? undefined : value)}
        >
          <SelectTrigger className="sm:w-48" aria-label={select.label}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{select.allLabel}</SelectItem>
            {select.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={loadingLabel} />}
    </div>
  );
}
