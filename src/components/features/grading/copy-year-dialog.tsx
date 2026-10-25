"use client";

import { CopyPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { copyGradingFromYear, previewYearCopy, type YearCopyLine } from "@/lib/grading/copy-actions";
import { ltr } from "@/lib/format";

import { useGradingError } from "./use-grading-error";

type Props = {
  toYear: { id: string; label: string };
  /** Earlier years of the school, most recent first. */
  earlierYears: { id: string; label: string }[];
  levelNames: Record<string, string>;
};

/** Level rules + coefficients of an earlier year into this one: pick the year, preview, copy. */
export function CopyYearDialog({ toYear, earlierYears, levelNames }: Props) {
  const t = useTranslations("grading.copyYear");
  const translateError = useGradingError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState(earlierYears[0]?.id ?? "");
  const [preview, setPreview] = useState<YearCopyLine[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const toCopy = preview?.filter((l) => l.status === "copy").length ?? 0;

  function reset(next: boolean) {
    setOpen(next);
    if (!next) setPreview(null);
  }

  function run(apply: boolean) {
    startTransition(async () => {
      const result = apply ? await copyGradingFromYear(fromId, toYear.id) : await previewYearCopy(fromId, toYear.id);
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

  const count = (kind: YearCopyLine["kind"], status: YearCopyLine["status"]) =>
    preview?.filter((l) => l.kind === kind && l.status === status).length ?? 0;
  const levelIds = [...new Set((preview ?? []).map((l) => l.levelId))];

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CopyPlus aria-hidden />
          {t("open")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { year: ltr(toYear.label) })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <label htmlFor="copy-from-year" className="text-sm font-medium">
            {t("from")}
          </label>
          <Select
            value={fromId}
            onValueChange={(v) => {
              setFromId(v);
              setPreview(null);
            }}
            disabled={isPending}
          >
            <SelectTrigger id="copy-from-year" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {earlierYears.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {preview && (
          <div className="flex max-h-72 flex-col gap-3 overflow-y-auto text-sm" data-copy-preview>
            {preview.length === 0 ? (
              <p className="text-muted-foreground">{t("empty")}</p>
            ) : (
              <>
                <p>{t("rulesSummary", { copy: count("rules", "copy"), kept: count("rules", "exists") })}</p>
                <p>{t("coefficientsSummary", { copy: count("coefficient", "copy"), kept: count("coefficient", "exists") })}</p>
                <ul className="flex flex-col gap-1 rounded-md border p-3">
                  {levelIds.map((id) => {
                    const lines = preview.filter((l) => l.levelId === id && l.kind === "coefficient");
                    const copied = lines.filter((l) => l.status === "copy").length;
                    const rules = preview.find((l) => l.levelId === id && l.kind === "rules");
                    return (
                      <li key={id} className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium">{levelNames[id] ?? "…"}</span>
                        <span className="text-muted-foreground">
                          {t("levelLine", { copy: copied, kept: lines.length - copied })}
                          {rules ? ` · ${t(rules.status === "copy" ? "levelRulesCopy" : "levelRulesKept")}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {toCopy === 0 && <p className="text-muted-foreground">{t("nothing")}</p>}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          {preview === null ? (
            <Button onClick={() => run(false)} disabled={!fromId || isPending}>
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
