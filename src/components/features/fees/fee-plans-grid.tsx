"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { amountInputText, formatCentimes, MAX_CENTIMES, parseAmount } from "@/lib/fees/money";
import { saveFeePlans } from "@/lib/fees/settings-actions";
import type { FeePlan } from "@/lib/fees/setup";
import { cn } from "@/lib/utils";

import { useFeesError } from "./use-fees-error";

type Draft = { registration: string; monthly: string };

type Props = {
  yearId: string;
  groups: { cycle: string; cycleName: string; levels: { id: string; name: string }[] }[];
  plans: FeePlan[];
  /** Billed months of the year (for the year total). */
  monthsCount: number;
  canManage: boolean;
};

const valid = (text: string) => {
  const v = parseAmount(text);
  return v === null || (!Number.isNaN(v) && v <= MAX_CENTIMES);
};

/**
 * Registration + monthly fee per level, grouped by cycle. Edits stay in the
 * page until "Enregistrer", which sends the changed levels in one call. Both
 * boxes empty = no fee for the level.
 */
export function FeePlansGrid({ yearId, groups, plans, monthsCount, canManage }: Props) {
  const t = useTranslations("fees.plans");
  const translateError = useFeesError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initial = useMemo(
    () =>
      Object.fromEntries(
        plans.map((p) => [p.levelId, { registration: amountInputText(p.registration), monthly: amountInputText(p.monthly) }]),
      ) as Record<string, Draft>,
    [plans],
  );
  const [draft, setDraft] = useState<Record<string, Draft>>(initial);
  const [failedLevel, setFailedLevel] = useState<string | null>(null);
  const empty: Draft = { registration: "", monthly: "" };
  const get = (id: string) => draft[id] ?? empty;
  const levelIds = groups.flatMap((g) => g.levels.map((l) => l.id));
  const changed = levelIds.filter((id) => {
    const a = get(id);
    const b = initial[id] ?? empty;
    return a.registration.trim() !== b.registration || a.monthly.trim() !== b.monthly;
  });
  const invalid = changed.filter((id) => !valid(get(id).registration) || !valid(get(id).monthly));
  const dirty = changed.length > 0;

  // Leaving with unsaved amounts: the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (id: string, field: keyof Draft, value: string) => {
    setFailedLevel(null);
    setDraft((d) => ({ ...d, [id]: { ...(d[id] ?? empty), [field]: value } }));
  };

  function save() {
    startTransition(async () => {
      const rows = changed.map((levelId) => ({ levelId, ...get(levelId) }));
      const result = await saveFeePlans(yearId, rows);
      if (!result.ok) {
        setFailedLevel(result.level ?? null);
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("saved", { count: rows.length }));
      router.refresh();
    });
  }

  const total = (d: Draft) => {
    const r = parseAmount(d.registration);
    const m = parseAmount(d.monthly);
    if (r === null && m === null) return null;
    if (Number.isNaN(r) || Number.isNaN(m)) return undefined;
    return (r ?? 0) + (m ?? 0) * monthsCount;
  };

  const header = "hidden text-xs font-medium text-muted-foreground sm:block";
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <Card key={group.cycle} className="gap-0 py-0" data-fee-cycle={group.cycle}>
          <div className="grid grid-cols-2 items-center gap-x-3 gap-y-2 border-b px-4 py-3 sm:grid-cols-[minmax(5rem,1fr)_9rem_9rem_minmax(8rem,1fr)]">
            <h3 className="col-span-2 text-sm font-semibold sm:col-span-1">{group.cycleName}</h3>
            <span className={header}>{t("registration")}</span>
            <span className={header}>{t("monthly")}</span>
            <span className={cn(header, "text-end")}>{t("yearTotal")}</span>
          </div>
          <ul className="divide-y">
            {group.levels.map((level) => {
              const d = get(level.id);
              const sum = total(d);
              const before = initial[level.id] ?? empty;
              const rowChanged = d.registration.trim() !== before.registration || d.monthly.trim() !== before.monthly;
              const bad = (v: string) => !valid(v) || failedLevel === level.id;
              return (
                <li
                  key={level.id}
                  data-fee-level={level.id}
                  data-changed={rowChanged}
                  className={cn(
                    "grid grid-cols-2 items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(5rem,1fr)_9rem_9rem_minmax(8rem,1fr)]",
                    rowChanged && "bg-primary/5",
                  )}
                >
                  <bdi className="col-span-2 font-medium sm:col-span-1">{level.name}</bdi>
                  {(["registration", "monthly"] as const).map((field) =>
                    canManage ? (
                      <label key={field} className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground sm:sr-only">{t(field)}</span>
                        <Input
                          inputMode="decimal"
                          autoComplete="off"
                          dir="ltr"
                          className="min-h-11 font-numeric text-end tabular-nums"
                          value={d[field]}
                          placeholder="—"
                          aria-label={t(field === "registration" ? "registrationLabel" : "monthlyLabel", { level: level.name })}
                          aria-invalid={bad(d[field])}
                          disabled={isPending}
                          onChange={(e) => set(level.id, field, e.target.value)}
                        />
                      </label>
                    ) : (
                      <span key={field} className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground sm:sr-only">{t(field)}</span>
                        <span className="font-numeric tabular-nums">
                          {parseAmount(d[field]) === null ? "—" : formatCentimes(parseAmount(d[field])!)}
                        </span>
                      </span>
                    ),
                  )}
                  <span className="col-span-2 text-sm sm:col-span-1 sm:text-end" data-fee-total>
                    {sum === null ? (
                      <span className="text-muted-foreground">{t("noFee")}</span>
                    ) : sum === undefined ? (
                      "—"
                    ) : (
                      <span className="font-numeric font-medium tabular-nums">{formatCentimes(sum)}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      {canManage && dirty && (
        <div
          data-fee-savebar
          className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-md"
        >
          <div className="flex flex-col text-sm">
            <span className="font-medium">{t("pending", { count: changed.length })}</span>
            {invalid.length > 0 && <span className="text-destructive">{t("invalidRows", { count: invalid.length })}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => setDraft(initial)} disabled={isPending}>
              {t("cancel")}
            </Button>
            <Button className="min-h-11" onClick={save} disabled={isPending || invalid.length > 0}>
              {isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
