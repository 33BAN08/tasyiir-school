"use client";

import { Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { useRouter } from "@/i18n/navigation";
import { applySubjectTemplate } from "@/lib/structure/subject-actions";
import { SUBJECT_SWATCH, SUBJECT_TEMPLATE, SUBJECT_TEMPLATE_KEYS } from "@/lib/structure/subject-template";
import { cn } from "@/lib/utils";

import { useSetupError } from "./use-setup-error";

type Props = {
  /** Template keys the school already has (by code or by name in any language). */
  present: string[];
  variant?: "default" | "outline";
};

/** "Moroccan subjects": everything ticked; untick what the school does not teach. */
export function SubjectTemplateDialog({ present, variant = "outline" }: Props) {
  const t = useTranslations("setup.subjects.template");
  const translateError = useSetupError();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(() => new Set(SUBJECT_TEMPLATE_KEYS));
  const [isPending, startTransition] = useTransition();
  const has = new Set(present);
  const toCreate = SUBJECT_TEMPLATE.filter((s) => picked.has(s.key) && !has.has(s.key)).length;

  function toggle(key: string, on: boolean) {
    setPicked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  function apply() {
    startTransition(async () => {
      const result = await applySubjectTemplate([...picked], locale);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("done", { count: result.data.created }));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setPicked(new Set(SUBJECT_TEMPLATE_KEYS));
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Sparkles aria-hidden />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <ul className="grid gap-2 sm:grid-cols-2">
          {SUBJECT_TEMPLATE.map((s) => {
            const exists = has.has(s.key);
            const id = `tpl-subject-${s.key}`;
            return (
              <li key={s.key} className="flex items-center gap-2">
                <Checkbox
                  id={id}
                  checked={exists || picked.has(s.key)}
                  disabled={exists || isPending}
                  onCheckedChange={(v) => toggle(s.key, v === true)}
                />
                <span aria-hidden className={cn("size-3 shrink-0 rounded-full", SUBJECT_SWATCH[s.color])} />
                <label htmlFor={id} className="text-sm">
                  {t(`names.${s.key}` as Parameters<typeof t>[0])}
                </label>
                <Badge variant="secondary" className="font-normal" dir="ltr">
                  {s.code}
                </Badge>
                {exists && <span className="text-xs text-muted-foreground">{t("exists")}</span>}
              </li>
            );
          })}
        </ul>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <p className="text-sm text-muted-foreground">{t("summary", { count: toCreate })}</p>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={isPending}>
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button onClick={apply} disabled={isPending || toCreate === 0}>
              {isPending ? t("applying") : t("apply")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
