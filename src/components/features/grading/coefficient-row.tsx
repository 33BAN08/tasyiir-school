"use client";

import { ArrowDown, ArrowUp, Plus, Save, Undo2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { removeCoefficient, saveCoefficient } from "@/lib/grading/coefficient-actions";
import type { CoefficientRow as Row } from "@/lib/grading/setup";
import { SUBJECT_SWATCH, type SubjectColor } from "@/lib/structure/subject-template";
import { cn } from "@/lib/utils";
import type { CoefficientScope } from "@/lib/validations/grading";

import { useGradingError } from "./use-grading-error";

export type CoefficientSubject = { id: string; name: string; color: SubjectColor };

type Props = {
  scope: CoefficientScope;
  subject: CoefficientSubject;
  /** This scope's row; null = not graded here (yet). */
  row: Row | null;
  /** In a filière: the level's common row for the same subject (inherited while `row` is null). */
  common: Row | null;
  /** The level's number of contrôles (placeholder of the override). */
  levelControls: number;
  canManage: boolean;
  move?: { up: (() => void) | null; down: (() => void) | null; pending: boolean };
};

const num = (n: number) => n.toLocaleString("fr-FR");

/** One subject of the coefficient list: values, save, order, remove (or add / customise). */
export function CoefficientRow({ scope, subject, row, common, levelControls, canManage, move }: Props) {
  const t = useTranslations("grading.coefficients");
  const translateError = useGradingError();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const start = row ?? common;
  const [adding, setAdding] = useState(false);
  const [coefficient, setCoefficient] = useState(start ? num(start.coefficient) : "1");
  const [controls, setControls] = useState(start?.controlsCount ? String(start.controlsCount) : "");
  const [error, setError] = useState<string | null>(null);
  const editing = row !== null || adding;
  const dirty =
    row === null ||
    coefficient.trim() !== num(row.coefficient) ||
    controls.trim() !== (row.controlsCount ? String(row.controlsCount) : "");
  const inFiliere = scope.trackId !== null;

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveCoefficient(scope, subject.id, { coefficient, controlsCount: controls });
      if (!result.ok) {
        if (result.field) setError(translateError(result.error));
        else toast.error(translateError(result.error));
        return;
      }
      toast.success(t("saved", { subject: subject.name }));
      setAdding(false);
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeCoefficient(scope, subject.id);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t(inFiliere ? "backToCommonDone" : "removed", { subject: subject.name }));
      router.refresh();
    });
  }

  const ids = { coefficient: `coef-${subject.id}`, controls: `ctrl-${subject.id}` };
  const busy = isPending || !!move?.pending;

  return (
    <li
      data-coefficient={subject.id}
      data-graded={row !== null}
      className="flex flex-col gap-3 px-4 py-3 md:grid md:grid-cols-[minmax(10rem,1fr)_7rem_7rem_auto] md:items-center md:gap-4"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("size-2.5 shrink-0 rounded-full", SUBJECT_SWATCH[subject.color])} aria-hidden />
        <span className={cn("truncate font-medium", !editing && "text-muted-foreground")}>{subject.name}</span>
      </div>

      {editing && canManage ? (
        <>
          <label className="flex items-center gap-2" htmlFor={ids.coefficient}>
            <span className="text-sm text-muted-foreground md:sr-only">{t("coefficient")}</span>
            <Input
              id={ids.coefficient}
              value={coefficient}
              onChange={(e) => setCoefficient(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && dirty && save()}
              inputMode="decimal"
              aria-invalid={!!error}
              className="w-20 font-numeric tabular-nums"
              disabled={busy}
            />
          </label>
          <label className="flex items-center gap-2" htmlFor={ids.controls}>
            <span className="text-sm text-muted-foreground md:sr-only">{t("controls")}</span>
            <Input
              id={ids.controls}
              value={controls}
              onChange={(e) => setControls(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && dirty && save()}
              placeholder={String(levelControls)}
              inputMode="numeric"
              aria-invalid={!!error}
              className="w-20 font-numeric tabular-nums"
              disabled={busy}
            />
          </label>
          <div className="flex flex-wrap items-center gap-1 md:justify-end">
            {row && move && (
              <>
                <Button variant="ghost" size="icon" aria-label={t("moveUp", { subject: subject.name })}
                  onClick={move.up ?? undefined} disabled={!move.up || busy}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" aria-label={t("moveDown", { subject: subject.name })}
                  onClick={move.down ?? undefined} disabled={!move.down || busy}>
                  <ArrowDown aria-hidden />
                </Button>
              </>
            )}
            <Button size="sm" onClick={save} disabled={!dirty || busy}>
              {row ? <Save aria-hidden /> : <Plus aria-hidden />}
              {row ? t("save") : t("add")}
            </Button>
            {row ? (
              <Button variant="ghost" size="sm" onClick={remove} disabled={busy}>
                {inFiliere ? <Undo2 aria-hidden /> : <X aria-hidden />}
                {inFiliere ? t("backToCommon") : t("remove")}
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)} disabled={busy}>
                {t("cancel")}
              </Button>
            )}
          </div>
          {error && <p className="text-sm text-destructive md:col-span-4">{error}</p>}
        </>
      ) : row ? (
        <>
          <Value label={t("coefficient")}>{num(row.coefficient)}</Value>
          <Value label={t("controls")}>{row.controlsCount ?? levelControls}</Value>
          <span />
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground md:col-span-2">
            {common
              ? t("inherited", { coefficient: num(common.coefficient), controls: common.controlsCount ?? levelControls })
              : t("notGraded")}
          </p>
          <div className="flex md:justify-end">
            {canManage && (
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                <Plus aria-hidden />
                {common ? t("customise") : t("add")}
              </Button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

function Value({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground md:sr-only">{label}</span>
      <span className="font-numeric tabular-nums">{children}</span>
    </div>
  );
}
