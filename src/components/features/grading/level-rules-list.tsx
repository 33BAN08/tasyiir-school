"use client";

import { RotateCcw, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import type { LevelRules } from "@/lib/grading/setup";
import { resetLevelRules, saveLevelRules } from "@/lib/grading/rules-actions";
import { ltr } from "@/lib/format";

import { useGradingError } from "./use-grading-error";

export type RulesGroup = { cycle: string; cycleLabel: string; levels: { id: string; name: string; rules: LevelRules }[] };

type Props = { yearId: string; groups: RulesGroup[]; canManage: boolean };

/** Scale, number of contrôles and activités per level, grouped by cycle. */
export function LevelRulesList({ yearId, groups, canManage }: Props) {
  const t = useTranslations("grading.rules");
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <Card key={group.cycle} className="gap-0 py-0">
          <h3 className="border-b px-4 py-3 text-sm font-semibold">{group.cycleLabel}</h3>
          <div
            aria-hidden
            className="hidden border-b px-4 py-2 text-xs text-muted-foreground md:grid md:grid-cols-[minmax(8rem,1fr)_8rem_7rem_minmax(9rem,auto)_auto] md:gap-4"
          >
            <span>{t("level")}</span>
            <span>{t("scale")}</span>
            <span>{t("controls")}</span>
            <span>{t("activities")}</span>
            <span />
          </div>
          <ul className="divide-y">
            {group.levels.map((level) => (
              <LevelRuleRow key={level.id} yearId={yearId} level={level} canManage={canManage} />
            ))}
          </ul>
        </Card>
      ))}
      <p className="text-sm text-muted-foreground">{t("defaultsNote")}</p>
    </div>
  );
}

function LevelRuleRow({
  yearId,
  level,
  canManage,
}: {
  yearId: string;
  level: RulesGroup["levels"][number];
  canManage: boolean;
}) {
  const t = useTranslations("grading.rules");
  const translateError = useGradingError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const initial = level.rules;
  const [scale, setScale] = useState<10 | 20>(initial.scale);
  const [controls, setControls] = useState(String(initial.controlsCount));
  const [activities, setActivities] = useState(initial.activities);
  const [error, setError] = useState<string | null>(null);
  const dirty = scale !== initial.scale || controls.trim() !== String(initial.controlsCount) || activities !== initial.activities;
  const ids = { scale: `scale-${level.id}`, controls: `controls-${level.id}`, activities: `activities-${level.id}` };

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveLevelRules(yearId, level.id, { scale, controlsCount: controls, activities });
      if (!result.ok) {
        if (result.field) setError(translateError(result.error));
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("saved", { level: level.name }));
      router.refresh();
    });
  }

  function reset() {
    setError(null);
    startTransition(async () => {
      const result = await resetLevelRules(yearId, level.id);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("resetDone", { level: level.name }));
      router.refresh();
    });
  }

  return (
    <li
      data-level-rules={level.id}
      className="flex flex-col gap-3 px-4 py-3 md:grid md:grid-cols-[minmax(8rem,1fr)_8rem_7rem_minmax(9rem,auto)_auto] md:items-center md:gap-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{level.name}</span>
        {initial.customised && <Badge variant="secondary">{t("customised")}</Badge>}
      </div>
      {canManage ? (
        <>
          <div className="flex items-center gap-2">
            <Label htmlFor={ids.scale} className="text-muted-foreground md:sr-only">
              {t("scale")}
            </Label>
            <Select value={String(scale)} onValueChange={(v) => setScale(v === "10" ? 10 : 20)} disabled={isPending}>
              <SelectTrigger id={ids.scale} className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">{ltr("/20")}</SelectItem>
                <SelectItem value="10">{ltr("/10")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={ids.controls} className="text-muted-foreground md:sr-only">
              {t("controls")}
            </Label>
            <Input
              id={ids.controls}
              value={controls}
              onChange={(e) => setControls(e.target.value)}
              inputMode="numeric"
              aria-invalid={!!error}
              className="w-20 font-numeric tabular-nums"
              disabled={isPending}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={ids.activities}
              checked={activities}
              onCheckedChange={(v) => setActivities(v === true)}
              disabled={isPending}
            />
            <Label htmlFor={ids.activities}>{t("activities")}</Label>
          </div>
          <div className="flex flex-wrap gap-2 md:justify-end">
            {initial.customised && (
              <Button variant="ghost" size="sm" onClick={reset} disabled={isPending}>
                <RotateCcw aria-hidden />
                {t("reset")}
              </Button>
            )}
            <Button size="sm" onClick={save} disabled={!dirty || isPending}>
              <Save aria-hidden />
              {isPending ? t("saving") : t("save")}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive md:col-span-5">{error}</p>}
        </>
      ) : (
        <>
          <ReadOnlyValue label={t("scale")}>{ltr(`/${initial.scale}`)}</ReadOnlyValue>
          <ReadOnlyValue label={t("controls")}>
            <span className="font-numeric tabular-nums">{initial.controlsCount}</span>
          </ReadOnlyValue>
          <ReadOnlyValue label={t("activities")}>{initial.activities ? t("yes") : t("no")}</ReadOnlyValue>
          <span />
        </>
      )}
    </li>
  );
}

/** A value with its label shown above it on phones (the column header says it on wider screens). */
function ReadOnlyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col text-sm">
      <span className="text-xs text-muted-foreground md:sr-only">{label}</span>
      <span>{children}</span>
    </div>
  );
}
