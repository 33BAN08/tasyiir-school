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
import { copyFeesFromYear, previewFeeCopy, type FeeCopyLine } from "@/lib/fees/copy-actions";
import { ltr } from "@/lib/format";

import { useFeesError } from "./use-fees-error";

type Props = {
  toYear: { id: string; label: string };
  /** Earlier years of the school, most recent first. */
  earlierYears: { id: string; label: string }[];
  levelNames: Record<string, string>;
};

/** Plans + services of an earlier year into this one: pick the year, preview, copy. */
export function FeeCopyDialog({ toYear, earlierYears, levelNames }: Props) {
  const t = useTranslations("fees.copyYear");
  const translateError = useFeesError();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState(earlierYears[0]?.id ?? "");
  const [preview, setPreview] = useState<FeeCopyLine[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const toCopy = preview?.filter((l) => l.status === "copy") ?? [];

  function reset(next: boolean) {
    setOpen(next);
    if (!next) setPreview(null);
  }

  function run(apply: boolean) {
    startTransition(async () => {
      const result = apply ? await copyFeesFromYear(fromId, toYear.id) : await previewFeeCopy(fromId, toYear.id);
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

  const count = (kind: FeeCopyLine["kind"], status: FeeCopyLine["status"]) =>
    preview?.filter((l) => l.kind === kind && l.status === status).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11">
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
          <label htmlFor="fee-copy-from" className="text-sm font-medium">
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
            <SelectTrigger id="fee-copy-from" className="min-h-11 w-44">
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
                <p>{t("plansSummary", { copy: count("plan", "copy"), kept: count("plan", "exists") })}</p>
                <p>{t("servicesSummary", { copy: count("service", "copy"), kept: count("service", "exists") })}</p>
                {toCopy.length > 0 ? (
                  <ul className="flex flex-col gap-1 rounded-md border p-3">
                    {toCopy.map((l) => (
                      <li key={`${l.kind}:${l.key}`}>
                        <bdi>{l.kind === "plan" ? (levelNames[l.key] ?? "…") : l.key}</bdi>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">{t("nothing")}</p>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" className="min-h-11" disabled={isPending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          {preview === null ? (
            <Button className="min-h-11" onClick={() => run(false)} disabled={!fromId || isPending}>
              {t("preview")}
            </Button>
          ) : (
            <Button className="min-h-11" onClick={() => run(true)} disabled={toCopy.length === 0 || isPending}>
              {t("confirm", { count: toCopy.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
