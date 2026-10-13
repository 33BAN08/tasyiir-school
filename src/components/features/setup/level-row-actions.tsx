"use client";

import { ArrowDown, ArrowUp, ListTree, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import { deleteLevel, moveLevel } from "@/lib/structure/level-actions";
import type { Level } from "@/lib/structure/levels";

import { ConfirmDeleteDialog } from "./confirm-dialog";
import { LevelDialog } from "./level-dialog";
import { TracksDialog } from "./tracks-dialog";
import { useSetupError } from "./use-setup-error";

type Props = { level: Level; isFirst: boolean; isLast: boolean };

/** Row menu: edit, filières, move up/down within the cycle, delete. */
export function LevelRowActions({ level, isFirst, isLast }: Props) {
  const t = useTranslations("setup.levels");
  const translateError = useSetupError();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "tracks" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    startTransition(async () => {
      const result = await action();
      if (dialog === "delete") setDialog(null);
      if (!result.ok) {
        toast.error(translateError(result.error ?? "generic"));
        return;
      }
      if (done) toast.success(done);
      router.refresh();
    });
  }

  const close = (open: boolean) => !open && setDialog(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("actions", { name: level.name })} disabled={isPending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-52">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil aria-hidden />
            {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("tracks")}>
            <ListTree aria-hidden />
            {t("manageTracks")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={isFirst} onSelect={() => run(() => moveLevel(level.id, "up"))}>
            <ArrowUp aria-hidden />
            {t("moveUp")}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isLast} onSelect={() => run(() => moveLevel(level.id, "down"))}>
            <ArrowDown aria-hidden />
            {t("moveDown")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 aria-hidden />
            {t("delete.button")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LevelDialog
        levelId={level.id}
        defaults={{ name: level.name, cycle: level.cycle }}
        open={dialog === "edit"}
        onOpenChange={close}
      />
      <TracksDialog level={level} open={dialog === "tracks"} onOpenChange={close} />
      <ConfirmDeleteDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={t("delete.title", { name: level.name })}
        description={t("delete.description", { count: level.tracks.length })}
        pending={isPending}
        onConfirm={() => run(() => deleteLevel(level.id), t("delete.done", { name: level.name }))}
      />
    </>
  );
}
