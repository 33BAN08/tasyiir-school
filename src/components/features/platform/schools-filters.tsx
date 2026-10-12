"use client";

import { Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { SCHOOL_STATUSES } from "@/lib/validations/platform";

const ALL = "all";
const SEARCH_DELAY_MS = 300;

/** Search + status filter, kept in the URL (?q=&status=) so lists are shareable. */
export function SchoolsFilters() {
  const t = useTranslations("platform.schools");
  const tStatus = useTranslations("platform.schoolStatus");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function update(key: "q" | "status", value: string | undefined) {
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
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative sm:max-w-xs sm:flex-1">
        <Search
          className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchLabel")}
          className="ps-8"
        />
      </div>
      <Select
        value={searchParams.get("status") ?? ALL}
        onValueChange={(value) => update("status", value === ALL ? undefined : value)}
      >
        <SelectTrigger className="sm:w-48" aria-label={t("statusFilterLabel")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t("statusAll")}</SelectItem>
          {SCHOOL_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {tStatus(status)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isPending && (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t("loading")} />
      )}
    </div>
  );
}
