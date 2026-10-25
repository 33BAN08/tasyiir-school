"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";

const COMMON = "common"; // a Select item cannot have the value ""

type Props = {
  yearId: string;
  levels: { id: string; name: string; tracks: { id: string; name: string }[] }[];
  levelId: string;
  trackId: string | null;
};

/** Which coefficients are shown: a level, then its common rows or one of its filières (kept in the URL). */
export function CoefficientScopePicker({ yearId, levels, levelId, trackId }: Props) {
  const t = useTranslations("grading.coefficients");
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const tracks = levels.find((l) => l.id === levelId)?.tracks ?? [];

  const go = (level: string, track: string | null) =>
    startTransition(() =>
      router.replace(`${pathname}?year=${yearId}&section=coefficients&level=${level}${track ? `&track=${track}` : ""}`),
    );

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <label htmlFor="coef-level" className="text-sm font-medium">
          {t("level")}
        </label>
        <Select value={levelId} onValueChange={(v) => go(v, null)} disabled={isPending}>
          <SelectTrigger id="coef-level" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {levels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {tracks.length > 0 && (
        <div className="flex items-center gap-2">
          <label htmlFor="coef-track" className="text-sm font-medium">
            {t("track")}
          </label>
          <Select value={trackId ?? COMMON} onValueChange={(v) => go(levelId, v === COMMON ? null : v)} disabled={isPending}>
            <SelectTrigger id="coef-track" className="w-64 max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={COMMON}>{t("commonRows")}</SelectItem>
              {tracks.map((tr) => (
                <SelectItem key={tr.id} value={tr.id}>
                  {tr.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
