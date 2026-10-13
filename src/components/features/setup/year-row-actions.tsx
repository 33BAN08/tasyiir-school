"use client";

import { CalendarCheck, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "@/i18n/navigation";
import type { AcademicYear } from "@/lib/structure/academic-years";
import { deleteAcademicYear, setCurrentAcademicYear } from "@/lib/structure/year-actions";

import { useSetupError } from "./use-setup-error";
import { YearDialog } from "./year-dialog";

/** Row menu: edit, make current, delete (with confirmation; not the current year). */
export function YearRowActions({ year }: { year: AcademicYear }) {
  const t = useTranslations("setup.years");
  const translateError = useSetupError();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    startTransition(async () => {
      const result = await action();
      setDeleting(false);
      if (!result.ok) {
        toast.error(translateError(result.error ?? "generic"));
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("actions", { label: year.label })} disabled={isPending}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-56">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil aria-hidden />
            {t("edit")}
          </DropdownMenuItem>
          {!year.isCurrent && (
            <DropdownMenuItem
              onSelect={() =>
                run(() => setCurrentAcademicYear(year.id), t("madeCurrent", { label: year.label }))
              }
            >
              <CalendarCheck aria-hidden />
              {t("makeCurrent")}
            </DropdownMenuItem>
          )}
          {!year.isCurrent && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                <Trash2 aria-hidden />
                {t("delete.button")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <YearDialog
        yearId={year.id}
        defaults={{ label: year.label, startDate: year.startDate, endDate: year.endDate }}
        open={editing}
        onOpenChange={setEditing}
      />

      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("delete.title", { label: year.label })}</DialogTitle>
            <DialogDescription>{t("delete.description")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isPending}>
                {t("delete.cancel")}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => run(() => deleteAcademicYear(year.id), t("delete.done", { label: year.label }))}
            >
              {t("delete.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
