"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
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

import { ConfirmDeleteDialog } from "./confirm-dialog";
import { useSetupError } from "./use-setup-error";

type Props = {
  /** Accessible name of the menu button, e.g. "Actions for Salle 12". */
  label: string;
  /** The edit dialog, controlled by this menu. */
  editDialog: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode;
  deleteTitle: string;
  deleteDescription: string;
  onDelete: () => Promise<{ ok: boolean; error?: string }>;
  deletedMessage: string;
};

/** Row menu with "Edit" and "Delete" (confirmation first), for simple setup lists. */
export function EditDeleteMenu({ label, editDialog, deleteTitle, deleteDescription, onDelete, deletedMessage }: Props) {
  const t = useTranslations("setup.rowMenu");
  const translateError = useSetupError();
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [isPending, startTransition] = useTransition();
  const close = (open: boolean) => !open && setDialog(null);

  function remove() {
    startTransition(async () => {
      const result = await onDelete();
      setDialog(null);
      if (!result.ok) {
        toast.error(translateError(result.error ?? "generic"));
        return;
      }
      toast.success(deletedMessage);
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={label} disabled={isPending}>
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
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {editDialog({ open: dialog === "edit", onOpenChange: close })}
      <ConfirmDeleteDialog
        open={dialog === "delete"}
        onOpenChange={close}
        title={deleteTitle}
        description={deleteDescription}
        pending={isPending}
        onConfirm={remove}
      />
    </>
  );
}
