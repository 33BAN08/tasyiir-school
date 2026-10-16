"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { EMPTY_GUARDIAN, GuardianDialog } from "./guardian-dialog";

/** Opens the guardian form; after creating, goes to the new guardian's page. */
export function NewGuardianButton() {
  const t = useTranslations("parents");
  const [open, setOpen] = useState(false);

  return (
    <GuardianDialog
      defaults={EMPTY_GUARDIAN}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button>
          <Plus aria-hidden />
          {t("new")}
        </Button>
      }
    />
  );
}
