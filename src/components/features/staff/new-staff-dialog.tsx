"use client";

import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import type { StaffRole } from "@/lib/staff/staff";

import { NewStaffForm, type CreatedStaff } from "./new-staff-form";
import { StaffCreatedNotice } from "./staff-created-notice";

/** "Add a staff member" button + dialog: form, then the one-time credentials. */
export function NewStaffDialog({ roles }: { roles: StaffRole[] }) {
  const t = useTranslations("staff.create");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedStaff | null>(null);
  // A new key remounts the form empty for "add another".
  const [formKey, setFormKey] = useState(0);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // The list must show the new account; the password is dropped from memory.
      if (created) router.refresh();
      setCreated(null);
      setFormKey((k) => k + 1);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus aria-hidden />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        // Closing by accident would lose the temporary password.
        onInteractOutside={(e) => created && e.preventDefault()}
        onEscapeKeyDown={(e) => created && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {created ? (
          <StaffCreatedNotice
            {...created}
            onAddAnother={() => {
              router.refresh();
              setCreated(null);
              setFormKey((k) => k + 1);
            }}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <NewStaffForm
            key={formKey}
            roles={roles}
            onCreated={setCreated}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
