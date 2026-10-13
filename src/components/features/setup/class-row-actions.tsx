"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
import { deleteClass } from "@/lib/structure/class-actions";
import type { SchoolClass } from "@/lib/structure/classes";
import type { Level } from "@/lib/structure/levels";

import { ClassDialog } from "./class-dialog";
import { ConfirmDeleteDialog } from "./confirm-dialog";
import { useSetupError } from "./use-setup-error";

type Props = { schoolClass: SchoolClass; academicYearId: string; levels: Level[]; takenNames: string[] };

/** Row menu: edit, delete. */
export function ClassRowActions({ schoolClass, academicYearId, levels, takenNames }: Props) {
  const t = useTranslations("setup.classes");
  const translateError = useSetupError();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();
  const close = (open: boolean) => !open && setDialog(null);

  function remove() {
    startTransition(async () => {
      const result = await deleteClass(schoolClass.id);
      setDialog(null);
      if (!result.ok) {
        toast.error(translateError(result.error));
        return;
      }
      toast.success(t("delete.done", { name: schoolClass.name }));
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("actions", { name: schoolClass.name })} disabled={isPending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-44">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil aria-hidden />
            {t("edit")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>
            <Trash2 aria-hidden />
            {t("delete.button")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ClassDialog
        academicYearId={academicYearId}
        classId={schoolClass.id}
        defaults={{ levelId: schoolClass.levelId, trackId: schoolClass.trackId ?? "", name: schoolClass.name }}
        levels={levels}
        takenNames={takenNames}
        open={dialog === "edit"}
        onOpenChange={close}
      />
      <ConfirmDeleteDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={t("delete.title", { name: schoolClass.name })}
        description={t("delete.description")}
        pending={isPending}
        onConfirm={remove}
      />
    </>
  );
}
