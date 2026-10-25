"use client";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { copyLevelCoefficients, previewLevelCopy, type LevelCopyLine } from "@/lib/grading/copy-actions";
import type { CoefficientScope } from "@/lib/validations/grading";

import { useGradingError } from "./use-grading-error";

type Props = {
  scope: CoefficientScope;
  /** "1AC" or "1AC · Sciences math". */
  sourceName: string;
  /** The other levels of the school (targets). */
  levels: { id: string; name: string }[];
  subjectNames: Record<string, string>;
};

/** Copy this level's (or filière's) coefficients into other levels' common rows: pick, preview, copy. */
export function CopyLevelsDialog({ scope, sourceName, levels, subjectNames }: Props) {
  const t = useTranslations("grading.copyLevels");
  const translateError = useGradingError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [preview, setPreview] = useState<LevelCopyLine[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const toCopy = preview?.filter((l) => l.status === "copy").length ?? 0;

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setPicked([]);
      setPreview(null);
    }
  }

  function run(apply: boolean) {
    startTransition(async () => {
      const result = apply ? await copyLevelCoefficients(scope, picked) : await previewLevelCopy(scope, picked);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      if (!apply) {
        setPreview(result.data);
        return;
      }
      toast.success(t("done", { count: result.data.filter((l) => l.status === "copy").length }));
      reset(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Copy aria-hidden />
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { source: sourceName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {preview === null ? (
          <fieldset className="flex max-h-72 flex-col gap-3 overflow-y-auto">
            <legend className="mb-2 text-sm font-medium">{t("targets")}</legend>
            {levels.map((level) => {
              const id = `copy-to-${level.id}`;
              return (
                <div key={level.id} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={picked.includes(level.id)}
                    onCheckedChange={(v) =>
                      setPicked((p) => (v === true ? [...p, level.id] : p.filter((x) => x !== level.id)))
                    }
                  />
                  <Label htmlFor={id}>{level.name}</Label>
                </div>
              );
            })}
          </fieldset>
        ) : (
          <div className="flex max-h-80 flex-col gap-3 overflow-y-auto text-sm" data-copy-preview>
            {levels
              .filter((level) => picked.includes(level.id))
              .map((level) => {
                const lines = preview.filter((l) => l.toLevelId === level.id);
                const copied = lines.filter((l) => l.status === "copy");
                return (
                  <div key={level.id} className="flex flex-col gap-1 rounded-md border p-3">
                    <p className="font-medium">{level.name}</p>
                    <p className="text-muted-foreground">
                      {t("summary", { copy: copied.length, kept: lines.length - copied.length })}
                    </p>
                    {copied.length > 0 && (
                      <p>{copied.map((l) => subjectNames[l.subjectId] ?? "…").join(" · ")}</p>
                    )}
                  </div>
                );
              })}
            {toCopy === 0 && <p className="text-muted-foreground">{t("nothing")}</p>}
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          {preview === null ? (
            <Button onClick={() => run(false)} disabled={picked.length === 0 || isPending}>
              {t("preview")}
            </Button>
          ) : (
            <Button onClick={() => run(true)} disabled={toCopy === 0 || isPending}>
              {t("confirm", { count: toCopy })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
