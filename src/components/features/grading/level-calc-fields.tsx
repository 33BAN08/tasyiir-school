"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMark } from "@/lib/grades/marks";
import type { LevelRules } from "@/lib/grading/setup";

export type CalcValues = {
  /** As typed ("1,5"). */
  activitiesWeight: string;
  absentAsZero: boolean;
  rounding: LevelRules["rounding"];
  ranking: LevelRules["ranking"];
};

export const calcValuesOf = (r: LevelRules): CalcValues => ({
  activitiesWeight: formatMark(r.activitiesWeight),
  absentAsZero: r.absentAsZero,
  rounding: r.rounding,
  ranking: r.ranking,
});

export const sameCalc = (a: CalcValues, b: CalcValues) =>
  Number(a.activitiesWeight.trim().replace(",", ".")) === Number(b.activitiesWeight.trim().replace(",", "."))
  && a.absentAsZero === b.absentAsZero && a.rounding === b.rounding && a.ranking === b.ranking;

function Choice<T extends string>({ id, label, value, options, onChange, disabled }: {
  id: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled}>
        <SelectTrigger id={id} className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/** How a level's averages are computed: activités weight, absent contrôle, rounding, ties. */
export function LevelCalcFields({ levelId, values, onChange, activities, disabled }: {
  levelId: string;
  values: CalcValues;
  onChange: (v: CalcValues) => void;
  /** The level has activités intégrées (else their weight is not asked). */
  activities: boolean;
  disabled: boolean;
}) {
  const t = useTranslations("grading.rules.calc");
  const set = (patch: Partial<CalcValues>) => onChange({ ...values, ...patch });
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3 md:col-span-5" data-level-calc={levelId}>
      <legend className="sr-only">{t("title")}</legend>
      <p aria-hidden className="text-xs font-medium">{t("title")}</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {activities && (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`aw-${levelId}`} className="text-xs text-muted-foreground">{t("activitiesWeight")}</Label>
            <div className="flex items-center gap-2 text-sm">
              <Input
                id={`aw-${levelId}`}
                value={values.activitiesWeight}
                onChange={(e) => set({ activitiesWeight: e.target.value })}
                inputMode="decimal"
                className="w-20 font-numeric tabular-nums"
                disabled={disabled}
              />
              <span className="text-muted-foreground">{t("activitiesWeightUnit")}</span>
            </div>
          </div>
        )}
        <Choice
          id={`absent-${levelId}`}
          label={t("absent")}
          value={values.absentAsZero ? "zero" : "skip"}
          options={[{ value: "skip", label: t("absentSkip") }, { value: "zero", label: t("absentZero") }]}
          onChange={(v) => set({ absentAsZero: v === "zero" })}
          disabled={disabled}
        />
        <Choice
          id={`rounding-${levelId}`}
          label={t("rounding")}
          value={values.rounding}
          options={[{ value: "round", label: t("round") }, { value: "truncate", label: t("truncate") }]}
          onChange={(v) => set({ rounding: v })}
          disabled={disabled}
        />
        <Choice
          id={`ranking-${levelId}`}
          label={t("ranking")}
          value={values.ranking}
          options={[{ value: "shared", label: t("shared") }, { value: "dense", label: t("dense") }]}
          onChange={(v) => set({ ranking: v })}
          disabled={disabled}
        />
      </div>
    </fieldset>
  );
}

/** Read-only (surveillant): the same four rules as one line. */
export function LevelCalcSummary({ rules }: { rules: LevelRules }) {
  const t = useTranslations("grading.rules.calc");
  const parts = [
    ...(rules.activities ? [t("summaryActivities", { weight: formatMark(rules.activitiesWeight) })] : []),
    rules.absentAsZero ? t("absentZero") : t("absentSkip"),
    rules.rounding === "truncate" ? t("truncate") : t("round"),
    rules.ranking === "dense" ? t("dense") : t("shared"),
  ];
  return (
    <p className="text-xs text-muted-foreground md:col-span-5" data-level-calc-summary>
      <span className="font-medium text-foreground">{t("summaryLabel")}</span>{" "}
      {parts.join(" · ")}
    </p>
  );
}
