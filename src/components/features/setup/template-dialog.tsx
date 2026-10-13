"use client";

import { Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
import { useRouter } from "@/i18n/navigation";
import { MOROCCAN_TEMPLATE, templateLevels } from "@/lib/structure/level-template";
import { applyLevelTemplate } from "@/lib/structure/template-actions";

import { useSetupError } from "./use-setup-error";

type Props = {
  /** What the school already has: lower-cased level names, and `"<level>:<track key>"` for template filières. */
  existing: { levels: string[]; tracks: string[] };
  variant?: "default" | "outline";
};

const ALL_LEVELS = templateLevels();

/** "Moroccan template": everything ticked; untick what the school does not teach. */
export function TemplateDialog({ existing, variant = "outline" }: Props) {
  const t = useTranslations("setup.levels.template");
  const tCycles = useTranslations("setup.levels.cycles");
  const translateError = useSetupError();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const existingLevels = new Set(existing.levels);
  const existingTracks = new Set(existing.tracks);
  const levelExists = (name: string) => existingLevels.has(name.toLowerCase());
  const trackExists = (level: string, key: string) => existingTracks.has(`${level.toLowerCase()}:${key}`);

  const allKeys = () => ({
    levels: new Set(ALL_LEVELS.map((l) => l.name)),
    tracks: new Set(ALL_LEVELS.flatMap((l) => l.tracks)),
  });
  const [levels, setLevels] = useState(() => allKeys().levels);
  const [tracks, setTracks] = useState(() => allKeys().tracks);

  const toggle = (set: Set<string>, key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    return next;
  };

  const toCreate =
    ALL_LEVELS.filter((l) => levels.has(l.name) && !levelExists(l.name)).length +
    ALL_LEVELS.flatMap((l) =>
      (levels.has(l.name) || levelExists(l.name)) ? l.tracks.filter((k) => tracks.has(k) && !trackExists(l.name, k)) : [],
    ).length;

  function apply() {
    startTransition(async () => {
      const result = await applyLevelTemplate({ levels: [...levels], tracks: [...tracks] }, locale);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("done", { levels: result.data.levels, tracks: result.data.tracks }));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setLevels(allKeys().levels);
          setTracks(allKeys().tracks);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant}>
          <Sparkles aria-hidden />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          {Object.entries(MOROCCAN_TEMPLATE).map(([cycle, cycleLevels]) => (
            <fieldset key={cycle} className="flex flex-col gap-2 rounded-lg border p-3">
              <legend className="px-1 text-sm font-semibold">{tCycles(cycle as Parameters<typeof tCycles>[0])}</legend>
              {cycleLevels.map((level) => {
                const exists = levelExists(level.name);
                const id = `tpl-${level.name}`;
                return (
                  <div key={level.name} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={exists || levels.has(level.name)}
                        disabled={exists || isPending}
                        onCheckedChange={(v) => setLevels((s) => toggle(s, level.name, v === true))}
                      />
                      <label htmlFor={id} className="text-sm font-medium">
                        {level.name}
                      </label>
                      {exists && <span className="text-xs text-muted-foreground">{t("exists")}</span>}
                    </div>
                    {level.tracks.length > 0 && (
                      <div className="ms-6 flex flex-col gap-1.5">
                        {level.tracks.map((key) => {
                          const trackOn = exists || levels.has(level.name);
                          const has = trackExists(level.name, key);
                          const trackId = `tpl-${level.name}-${key}`;
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <Checkbox
                                id={trackId}
                                checked={has || (trackOn && tracks.has(key))}
                                disabled={has || !trackOn || isPending}
                                onCheckedChange={(v) => setTracks((s) => toggle(s, key, v === true))}
                              />
                              <label htmlFor={trackId} className="text-sm">
                                {t(`tracks.${key}` as Parameters<typeof t>[0])}
                              </label>
                              {has && <span className="text-xs text-muted-foreground">{t("exists")}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>

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
